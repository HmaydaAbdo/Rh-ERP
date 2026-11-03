"""Seul point d'écriture du journal d'audit (parité avec `GenericAuditAspect`, `AuditJournalWriter` et
`EcouteurEvenementsSecurite`).

Deux modes d'écriture (conventions/audit.md, « Transaction ») :
- l'entrée d'une opération **réussie** est écrite dans la transaction métier, liée à sa révision : tout est validé ou
  annulé ensemble ; si l'entrée ne peut pas s'écrire, l'opération échoue (fermé pour les données) ;
- un **échec** ou un **événement de sécurité** est écrit dans une transaction séparée : la tentative reste tracée même
  si la transaction de l'appelant est annulée. Un événement de sécurité qui ne s'écrit pas ne bloque rien (ouvert) : il
  est journalisé et compté.

Seules les opérations qui changent l'état et les événements de sécurité sont audités : aucune lecture, aucune sortie.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from staport.domains.audit.ecouteur import assurer_revision, installer_ecouteurs
from staport.domains.audit.metriques import MetriquesAudit
from staport.domains.audit.models import EntreeJournal
from staport.domains.audit.schemas import CategorieAudit, ResultatAudit
from staport.domains.common.audit_contexte import (
    ActionEnCours,
    ContexteAudit,
    TypeOperation,
    contexte_audit_courant,
)
from staport.domains.common.securite import RESULTATS_ECHEC, EvenementSecurite

journal = logging.getLogger("staport.audit")

MOTIF_LONGUEUR_MAX = 500

_action_en_cours: ContextVar[bool] = ContextVar("action_audit_en_cours", default=False)


class Audit:
    """Implémente le port `Auditeur` du domaine `common`."""

    def __init__(self, metriques: MetriquesAudit | None = None) -> None:
        self.metriques = metriques or MetriquesAudit()
        self._fabrique: async_sessionmaker[AsyncSession] | None = None
        installer_ecouteurs()

    def lier(self, fabrique: async_sessionmaker[AsyncSession]) -> None:
        """Fabrique de sessions dans laquelle s'écrivent les entrées indépendantes de la transaction de l'appelant."""
        self._fabrique = fabrique

    # --- Entrées -----------------------------------------------------------------------------------------------

    @staticmethod
    def _entree(
        contexte: ContexteAudit,
        categorie: CategorieAudit,
        action: str,
        resultat: ResultatAudit,
        *,
        type_operation: TypeOperation | None = None,
        utilisateur_id: int | None = None,
        utilisateur_nom: str | None = None,
        entite_type: str | None = None,
        entite_id: int | None = None,
        nombre_elements: int | None = None,
        perimetre: dict[str, Any] | None = None,
        motif: str | None = None,
        revision_id: int | None = None,
    ) -> dict[str, Any]:
        return {
            "horodatage": datetime.now(UTC),
            "categorie": categorie.value,
            "action": action,
            "type_operation": type_operation.value if type_operation else None,
            "resultat": resultat.value,
            "utilisateur_id": utilisateur_id if utilisateur_id is not None else contexte.utilisateur_id,
            "utilisateur_nom": utilisateur_nom if utilisateur_nom is not None else contexte.utilisateur_nom,
            "origine": contexte.origine.value,
            "request_id": contexte.request_id,
            "adresse_ip": contexte.adresse_ip,
            "user_agent": contexte.user_agent,
            "entite_type": entite_type,
            "entite_id": entite_id,
            "nombre_elements": nombre_elements,
            "perimetre": perimetre or None,
            "motif": motif[:MOTIF_LONGUEUR_MAX] if motif else None,
            "revision_id": revision_id,
        }

    async def _ecrire_separement(self, valeurs: dict[str, Any]) -> None:
        if self._fabrique is None:
            raise RuntimeError("Audit non lié à une fabrique de sessions")
        async with self._fabrique() as session, session.begin():
            await session.execute(insert(cast(Any, EntreeJournal.__table__)).values(valeurs))

    # --- Opérations --------------------------------------------------------------------------------------------

    @asynccontextmanager
    async def auditer(
        self,
        session: AsyncSession,
        action: str,
        type_operation: TypeOperation,
        entite: str,
        identifiant: int | None = None,
    ) -> AsyncGenerator[ActionEnCours]:
        """Entoure une opération métier. Seule l'action la plus externe écrit une entrée (un import qui crée des
        référentiels manquants n'en écrit qu'une)."""
        cible = ActionEnCours(identifiant)
        if _action_en_cours.get():
            yield cible
            return
        contexte = contexte_audit_courant()
        jeton = _action_en_cours.set(True)
        try:
            try:
                yield cible
                await session.flush()  # les contraintes sont vérifiées avant l'entrée
            except Exception as echec:
                await self._echec(contexte, action, type_operation, entite, cible, type(echec).__name__)
                raise
            if cible.motif_rejet is not None:
                await self._echec(contexte, action, type_operation, entite, cible, cible.motif_rejet)
                return
            try:
                revision = await session.run_sync(assurer_revision)
                valeurs = self._entree(
                    contexte,
                    CategorieAudit.OPERATION,
                    action,
                    ResultatAudit.SUCCES,
                    type_operation=type_operation,
                    entite_type=entite,
                    entite_id=cible.identifiant,
                    nombre_elements=cible.nombre_elements,
                    perimetre=cible.perimetre,
                    revision_id=revision,
                )
                await session.execute(insert(cast(Any, EntreeJournal.__table__)).values(valeurs))
            except Exception:
                self.metriques.ecriture_en_echec(CategorieAudit.OPERATION.value)
                journal.exception("Entrée d'audit impossible à écrire : action=%s, l'opération est annulée", action)
                await self._echec(contexte, action, type_operation, entite, cible, "AuditIndisponible")
                raise
        finally:
            _action_en_cours.reset(jeton)

    async def _echec(
        self,
        contexte: ContexteAudit,
        action: str,
        type_operation: TypeOperation,
        entite: str,
        cible: ActionEnCours,
        motif: str,
    ) -> None:
        """Entrée `ECHEC` dans une transaction séparée ; elle ne masque jamais l'exception d'origine."""
        try:
            await self._ecrire_separement(
                self._entree(
                    contexte,
                    CategorieAudit.OPERATION,
                    action,
                    ResultatAudit.ECHEC,
                    type_operation=type_operation,
                    entite_type=entite,
                    entite_id=cible.identifiant,
                    nombre_elements=cible.nombre_elements,
                    perimetre=cible.perimetre,
                    motif=motif,
                )
            )
        except Exception:
            self.metriques.ecriture_en_echec(CategorieAudit.OPERATION.value)
            journal.exception("Entrée d'audit d'échec impossible à écrire : action=%s", action)

    # --- Événements de sécurité --------------------------------------------------------------------------------

    async def publier(self, evenement: EvenementSecurite) -> None:
        contexte = contexte_audit_courant()
        resultat = ResultatAudit.ECHEC if evenement.action in RESULTATS_ECHEC else ResultatAudit.SUCCES
        try:
            await self._ecrire_separement(
                self._entree(
                    contexte,
                    CategorieAudit.SECURITE,
                    evenement.action.value,
                    resultat,
                    utilisateur_id=evenement.utilisateur_id,
                    utilisateur_nom=evenement.utilisateur_nom,
                    perimetre=evenement.details,
                    motif=evenement.motif,
                )
            )
            self.metriques.evenement_securite(evenement.action.value)
        except Exception:
            self.metriques.ecriture_en_echec(CategorieAudit.SECURITE.value)
            journal.exception("Événement de sécurité impossible à écrire : action=%s", evenement.action)
