"""Jeton délégué de l'assistant IA.

Le jeton porte l'identité seule : les droits sont relus à chaque appel d'outil (`identite_active`). Sans jeu de clés
(`MCP_ENABLED=false`), l'assistant est désactivé : 404.
"""

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from staport.domains.auth import repository
from staport.domains.auth.echange_jetons import PreparationEchange, ServeurEchange
from staport.domains.auth.exceptions import IaDesactivee
from staport.domains.auth.mappage import noms_des_roles, permissions_effectives
from staport.domains.auth.securite import (
    DUREE_JETON_AGENT,
    DUREE_REFERENCE_EXPORT,
    PERMISSION_IA,
    EmetteurJetons,
    JetonInvalide,
    JeuDeCles,
    emettre_reference_export,
    verifier_jeton_agent,
    verifier_reference_export,
)
from staport.domains.common.audit_contexte import Auditeur
from staport.domains.common.securite import ActionSecurite, EvenementSecurite


@dataclass(frozen=True)
class IdentiteAgent:
    utilisateur_id: int
    username: str
    permissions: frozenset[str]
    roles: frozenset[str]


class ServiceAgent:
    def __init__(self, cles: JeuDeCles | None, evenements: Auditeur) -> None:
        self._cles = cles
        self._evenements = evenements
        self._serveur = ServeurEchange(cles) if cles is not None else None

    async def echanger(self, session: AsyncSession, url: str, formulaire: dict[str, str]) -> JSONResponse:
        """Point d'accès `POST /oauth/token` : échange RFC 8693 du jeton de connexion contre le jeton agent (KAN-74).

        Le sujet est vérifié et les droits relus en base avant d'appeler Authlib, qui est synchrone ; chaque refus d'un
        compte connu et chaque émission sont journalisés (jamais le jeton : son identifiant et sa durée)."""
        if self._cles is None or self._serveur is None:
            raise IaDesactivee
        preparation = await self._preparer(session, formulaire.get("subject_token"))
        jti = str(uuid.uuid4())
        reponse = self._serveur.echanger(url, formulaire, preparation, jti)
        if preparation.identifiant is not None and preparation.username is not None:
            if preparation.refus is not None:
                await self._evenements.publier(
                    EvenementSecurite(
                        ActionSecurite.JETON_AGENT_REFUSE,
                        utilisateur_id=preparation.identifiant,
                        motif=preparation.refus,
                    )
                )
            elif reponse.status_code == 200:
                await self._evenements.publier(
                    EvenementSecurite(
                        ActionSecurite.JETON_AGENT_EMIS,
                        preparation.identifiant,
                        preparation.username,
                        details={"jti": jti, "dureeSecondes": int(DUREE_JETON_AGENT.total_seconds())},
                    )
                )
        return reponse

    async def _preparer(self, session: AsyncSession, sujet: str | None) -> PreparationEchange:
        if not sujet or self._cles is None:
            return PreparationEchange()
        try:
            acces = EmetteurJetons(self._cles).verifier_acces(sujet)
        except JetonInvalide:
            return PreparationEchange()
        async with session.begin():
            identite = await self.identite_active(session, acces.utilisateur_id)
        if identite is None:
            return PreparationEchange(acces.utilisateur_id, acces.username, "COMPTE_INACTIF", sujet_valide=True)
        refus = None if PERMISSION_IA in identite.permissions else "DROIT_IA_RETIRE"
        return PreparationEchange(identite.utilisateur_id, identite.username, refus, sujet_valide=True)

    def emettre_reference_export(
        self, utilisateur_id: int, username: str, periode: int, chantier_ids: list[int]
    ) -> tuple[str, int]:
        """Référence de téléchargement d'un export préparé par l'agent, et sa durée en secondes (KAN-266)."""
        if self._cles is None:
            raise IaDesactivee
        reference = emettre_reference_export(self._cles, utilisateur_id, username, periode, chantier_ids)
        return reference, int(DUREE_REFERENCE_EXPORT.total_seconds())

    def lire_reference_export(self, reference: str) -> tuple[int, int, list[int]]:
        """`(utilisateur_id, periode, chantier_ids)` d'une référence valide ; `JetonInvalide` sinon."""
        if self._cles is None:
            raise IaDesactivee
        return verifier_reference_export(self._cles, reference)

    def cles_publiques(self) -> dict[str, Any]:
        if self._cles is None:
            raise IaDesactivee
        return self._cles.jwks()

    async def authentifier(self, session: AsyncSession, jeton: str) -> tuple[IdentiteAgent, str] | None:
        """Identité courante et scope d'un jeton agent valide dont le compte est actif ; `None` sinon (route `/mcp`)."""
        if self._cles is None:
            return None
        try:
            utilisateur_id, username, scope = verifier_jeton_agent(self._cles, jeton)
        except JetonInvalide:
            return None
        identite = await self.identite_active(session, utilisateur_id)
        if identite is None or identite.username != username:
            return None
        return identite, scope

    async def identite_active(self, session: AsyncSession, utilisateur_id: int | None) -> IdentiteAgent | None:
        """Identité et droits courants d'un compte actif, `None` sinon (appelée dans une transaction ouverte)."""
        if utilisateur_id is None:
            return None
        utilisateur = await repository.utilisateur_par_id(session, utilisateur_id)
        if utilisateur is None or not utilisateur.actif:
            return None
        return IdentiteAgent(
            utilisateur.id,
            utilisateur.username,
            frozenset(permissions_effectives(utilisateur)),
            frozenset(noms_des_roles(utilisateur)),
        )
