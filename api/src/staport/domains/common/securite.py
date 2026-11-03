"""Événements de sécurité (parité avec `EvenementSecurite` / `ActionSecurite` de Spring).

Les domaines publient un événement par le port `PublicationEvenements` ; le domaine `audit` (KAN-214) fournit
l'implémentation qui l'écrit dans le journal. Par défaut, `PublicationJournal` le consigne dans le journal technique
(sans donnée sensible : jamais de mot de passe ni de jeton).
"""

import logging
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Protocol

journal = logging.getLogger("staport.securite")


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


@dataclass(frozen=True)
class EvenementSecurite:
    action: ActionSecurite
    utilisateur_id: int | None = None
    utilisateur_nom: str | None = None
    motif: str | None = None
    details: dict[str, Any] = field(default_factory=lambda: {})


class PublicationEvenements(Protocol):
    def publier(self, evenement: EvenementSecurite) -> None: ...


class PublicationJournal:
    """Implémentation par défaut : journal technique seulement (le journal d'audit arrive avec KAN-214)."""

    def publier(self, evenement: EvenementSecurite) -> None:
        journal.info(
            "evenement_securite action=%s utilisateur_id=%s motif=%s",
            evenement.action,
            evenement.utilisateur_id,
            evenement.motif,
        )
