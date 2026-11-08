"""Mesures de la synchronisation des chantiers (parité avec `ChantierSyncMetrics`, série `rh.chantier.sync.*`).

Valeurs en mémoire, lues par le collecteur Prometheus de `staport.platform.metriques`. Aucune dimension : un seul
traitement.
"""

from bisect import bisect_left

BORNES_DUREE_SECONDES = (0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0)


class MetriquesSynchronisation:
    def __init__(self) -> None:
        self.succes = 0
        """`rh.chantier.sync.success` : synchronisations réussies."""
        self.echecs = 0
        """`rh.chantier.sync.failure` : synchronisations échouées."""
        self.lignes_ignorees = 0
        """`rh.chantier.sync.records.ignored` : lignes de l'ERP ignorées (code manquant ou conflit d'intégrité)."""
        self.nombre_durees = 0
        self.somme_durees = 0.0
        self.seaux = [0] * len(BORNES_DUREE_SECONDES)
        """Effectif par borne supérieure, non cumulé (le collecteur cumule)."""

    def reussie(self, duree_secondes: float, ignorees: int) -> None:
        self.succes += 1
        self.lignes_ignorees += ignorees
        self._duree(duree_secondes)

    def echouee(self, duree_secondes: float) -> None:
        self.echecs += 1
        self._duree(duree_secondes)

    def _duree(self, secondes: float) -> None:
        self.nombre_durees += 1
        self.somme_durees += secondes
        position = bisect_left(BORNES_DUREE_SECONDES, secondes)
        if position < len(self.seaux):
            self.seaux[position] += 1
