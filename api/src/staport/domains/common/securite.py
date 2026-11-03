"""Événements de sécurité (parité avec `EvenementSecurite` / `ActionSecurite` de Spring).

Les domaines publient un événement par le port `Auditeur` (`audit_contexte`) ; le domaine `audit` l'écrit dans le
journal d'audit. Un événement ne contient jamais de mot de passe ni de jeton.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class ActionSecurite(StrEnum):
    CONNEXION_REUSSIE = "CONNEXION_REUSSIE"
    CONNEXION_ECHOUEE = "CONNEXION_ECHOUEE"
    COMPTE_BLOQUE_TEMPORAIREMENT = "COMPTE_BLOQUE_TEMPORAIREMENT"
    SESSION_RENOUVELEE = "SESSION_RENOUVELEE"
    SESSION_RENOUVELLEMENT_REFUSE = "SESSION_RENOUVELLEMENT_REFUSE"
    SESSIONS_REVOQUEES = "SESSIONS_REVOQUEES"
    DECONNEXION = "DECONNEXION"
    JETON_REUTILISE = "JETON_REUTILISE"
    MOT_DE_PASSE_OUBLIE = "MOT_DE_PASSE_OUBLIE"
    MOT_DE_PASSE_REINITIALISE = "MOT_DE_PASSE_REINITIALISE"
    MOT_DE_PASSE_REINITIALISE_PAR_ADMIN = "MOT_DE_PASSE_REINITIALISE_PAR_ADMIN"
    ACCES_REFUSE = "ACCES_REFUSE"
    ACCES_ANONYME_REFUSE = "ACCES_ANONYME_REFUSE"
    JETON_AGENT_EMIS = "JETON_AGENT_EMIS"
    JETON_AGENT_REFUSE = "JETON_AGENT_REFUSE"


RESULTATS_ECHEC = frozenset(
    {
        ActionSecurite.CONNEXION_ECHOUEE,
        ActionSecurite.SESSION_RENOUVELLEMENT_REFUSE,
        ActionSecurite.JETON_REUTILISE,
        ActionSecurite.ACCES_REFUSE,
        ActionSecurite.ACCES_ANONYME_REFUSE,
        ActionSecurite.JETON_AGENT_REFUSE,
    }
)
"""Actions dont l'entrée du journal est un échec (les autres sont des succès)."""


@dataclass(frozen=True)
class EvenementSecurite:
    action: ActionSecurite
    utilisateur_id: int | None = None
    utilisateur_nom: str | None = None
    motif: str | None = None
    details: dict[str, Any] = field(default_factory=lambda: {})
