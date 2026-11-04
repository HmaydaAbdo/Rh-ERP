"""Jeton délégué de l'assistant IA (parité avec `AgentService` de Spring).

Le jeton porte l'identité seule : les droits sont relus à chaque appel d'outil (`identite_active`). Sans jeu de clés
(`MCP_ENABLED=false`), l'assistant est désactivé : 404.
"""

from dataclasses import dataclass
from typing import Any, NoReturn

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth import repository
from staport.domains.auth.exceptions import IaDesactivee, JetonAgentRefuse
from staport.domains.auth.mappage import noms_des_roles, permissions_effectives
from staport.domains.auth.schemas import JetonAgentReponse
from staport.domains.auth.securite import (
    DUREE_JETON_AGENT,
    PERMISSION_IA,
    JetonInvalide,
    JeuDeCles,
    emettre_jeton_agent,
    verifier_jeton_agent,
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

    async def emettre_jeton(self, session: AsyncSession, utilisateur_id: int) -> JetonAgentReponse:
        if self._cles is None:
            raise IaDesactivee
        async with session.begin():
            identite = await self.identite_active(session, utilisateur_id)
            if identite is None:
                await self._refuser(utilisateur_id, "COMPTE_INACTIF")
            if PERMISSION_IA not in identite.permissions:
                await self._refuser(utilisateur_id, "DROIT_IA_RETIRE")
        jeton, jti = emettre_jeton_agent(self._cles, identite.utilisateur_id, identite.username)
        # Le jeton lui-même n'est jamais journalisé : seulement son identifiant et sa durée.
        await self._evenements.publier(
            EvenementSecurite(
                ActionSecurite.JETON_AGENT_EMIS,
                identite.utilisateur_id,
                identite.username,
                details={"jti": jti, "dureeSecondes": int(DUREE_JETON_AGENT.total_seconds())},
            )
        )
        return JetonAgentReponse(
            jeton=jeton, type_jeton="Bearer", expire_dans_secondes=int(DUREE_JETON_AGENT.total_seconds())
        )

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

    async def _refuser(self, utilisateur_id: int, motif: str) -> NoReturn:
        await self._evenements.publier(
            EvenementSecurite(ActionSecurite.JETON_AGENT_REFUSE, utilisateur_id=utilisateur_id, motif=motif)
        )
        raise JetonAgentRefuse
