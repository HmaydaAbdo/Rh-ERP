"""Contexte et port d'audit (parité avec `ResolveurContexteAudit`, `BatchAuditContext` et `@AuditableAction`).

Les domaines métier ne connaissent que ce module : ils déclarent l'opération à journaliser avec `Auditeur.auditer` et
publient les événements de sécurité ; le domaine `audit` (KAN-214) fournit l'implémentation qui écrit le journal et
l'historique `*_aud`. Seules les opérations qui changent l'état sont auditées (décision du propriétaire) : aucune
lecture, aucune sortie de données.
"""

import logging
import uuid
from collections.abc import AsyncGenerator, Generator
from contextlib import AbstractAsyncContextManager, asynccontextmanager, contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.securite import EvenementSecurite
from staport.platform.requete import contexte_requete

SYSTEME = "Système"
ANONYME = "Anonyme"


class Origine(StrEnum):
    """D'où vient une écriture. `INCONNUE` n'est jamais posée volontairement : elle révèle un oubli de contexte."""

    API = "API"
    TACHE_PLANIFIEE = "TACHE_PLANIFIEE"
    DEMARRAGE = "DEMARRAGE"
    MIGRATION = "MIGRATION"
    INCONNUE = "INCONNUE"


class TypeOperation(StrEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


@dataclass(frozen=True)
class ContexteAudit:
    utilisateur_id: int | None
    utilisateur_nom: str
    origine: Origine
    request_id: str | None
    adresse_ip: str | None
    user_agent: str | None


@dataclass(frozen=True)
class _Batch:
    utilisateur_nom: str
    origine: Origine
    request_id: str


_batch: ContextVar[_Batch | None] = ContextVar("contexte_batch", default=None)


@contextmanager
def contexte_batch(utilisateur_nom: str, origine: Origine) -> Generator[str]:
    """Traitement hors requête (tâche planifiée, démarrage) : l'identifiant d'exécution tient lieu de `request_id`."""
    identifiant = str(uuid.uuid4())
    jeton = _batch.set(_Batch(utilisateur_nom, origine, identifiant))
    try:
        yield identifiant
    finally:
        _batch.reset(jeton)


def contexte_audit_courant() -> ContexteAudit:
    """Traitement hors requête, puis utilisateur authentifié de la requête, puis visiteur anonyme, puis « Système »."""
    batch = _batch.get()
    requete = contexte_requete()
    adresse = requete.adresse_ip if requete else None
    agent = requete.user_agent if requete else None
    if batch is not None:
        return ContexteAudit(None, batch.utilisateur_nom, batch.origine, batch.request_id, adresse, agent)
    if requete is not None:
        if requete.utilisateur_nom is not None:
            return ContexteAudit(
                requete.utilisateur_id, requete.utilisateur_nom, Origine.API, requete.request_id, adresse, agent
            )
        return ContexteAudit(None, ANONYME, Origine.API, requete.request_id, adresse, agent)
    return ContexteAudit(None, SYSTEME, Origine.INCONNUE, None, None, None)


@dataclass
class ActionEnCours:
    """Ce que l'opération apprend en s'exécutant : sa cible (si elle n'était pas connue) et son périmètre."""

    identifiant: int | None = None
    nombre_elements: int | None = None
    perimetre: dict[str, Any] = field(default_factory=lambda: {})
    motif_rejet: str | None = None
    """Non nul quand l'opération a rejeté sans lever d'exception : l'entrée est alors un échec."""


class Auditeur(Protocol):
    def auditer(
        self,
        session: AsyncSession,
        action: str,
        type_operation: TypeOperation,
        entite: str,
        identifiant: int | None = None,
    ) -> AbstractAsyncContextManager[ActionEnCours]: ...

    async def publier(self, evenement: EvenementSecurite) -> None: ...


class AuditeurJournal:
    """Auditeur de repli sans base d'audit (essais isolés) : n'écrit que dans le journal technique."""

    def __init__(self) -> None:
        self._journal = logging.getLogger("staport.securite")

    @asynccontextmanager
    async def auditer(
        self,
        session: AsyncSession,
        action: str,
        type_operation: TypeOperation,
        entite: str,
        identifiant: int | None = None,
    ) -> AsyncGenerator[ActionEnCours]:
        yield ActionEnCours(identifiant)

    async def publier(self, evenement: EvenementSecurite) -> None:
        self._journal.info(
            "evenement_securite action=%s utilisateur_id=%s motif=%s",
            evenement.action,
            evenement.utilisateur_id,
            evenement.motif,
        )
