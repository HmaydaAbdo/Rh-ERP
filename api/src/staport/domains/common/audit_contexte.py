"""Action d'audit en cours (parité avec `@AuditableAction` de Spring).

Un service déclare, autour d'une opération métier, l'action à journaliser (`UTILISATEUR_CREATION`, ...). L'écouteur
d'audit du domaine `audit` (KAN-214) lit cette action au moment d'écrire les lignes `*_aud` et le journal ; sans
action déclarée, il n'écrit que l'historique de révision.
"""

from collections.abc import Generator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from enum import StrEnum


class TypeOperation(StrEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


@dataclass(frozen=True)
class ActionAuditee:
    action: str
    type_operation: TypeOperation
    entite: str


_courante: ContextVar[ActionAuditee | None] = ContextVar("action_auditee", default=None)


def action_auditee_courante() -> ActionAuditee | None:
    return _courante.get()


@contextmanager
def auditer(action: str, type_operation: TypeOperation, entite: str) -> Generator[None]:
    jeton = _courante.set(ActionAuditee(action, type_operation, entite))
    try:
        yield
    finally:
        _courante.reset(jeton)
