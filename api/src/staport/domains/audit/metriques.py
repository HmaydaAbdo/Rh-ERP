"""Compteurs de supervision de l'audit (parité avec `AuditMetrics`, à brancher sur l'export de métriques).

Un événement de sécurité non écrit ne bloque pas l'opération : il doit donc au moins déclencher une alerte.
"""

from collections import Counter


class MetriquesAudit:
    def __init__(self) -> None:
        self.ecritures_en_echec: Counter[str] = Counter()
        """`rh.audit.ecriture.echec`, par catégorie."""
        self.evenements_securite: Counter[str] = Counter()
        """`rh.audit.evenement.securite`, par action."""
        self.integrite_compromise = 0
        """`rh.audit.integrite.compromise` : 1 quand le compte applicatif peut modifier une table d'audit."""
        self.chaine_invalide = 0
        """`rh.audit.chaine.invalide` : 1 quand la vérification du chaînage échoue."""

    def ecriture_en_echec(self, categorie: str) -> None:
        self.ecritures_en_echec[categorie] += 1

    def evenement_securite(self, action: str) -> None:
        self.evenements_securite[action] += 1
