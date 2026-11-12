from decimal import Decimal

from staport.domains.paie.rapport_graphique import (
    _echelle,  # pyright: ignore[reportPrivateUsage]
    graphique_evolution,
    graphique_repartition,
    hauteur_repartition,
    nombre_parts,
)
from staport.domains.paie.report import PointEvolution


def test_echelle_arrondit_a_1_2_ou_5_fois_une_puissance_de_dix() -> None:
    assert _echelle(0) == 5
    assert _echelle(969) == 1000
    assert _echelle(4_421_310) == 5_000_000
    assert _echelle(8_900_000) == 10_000_000


def test_evolution_trace_effectif_et_montant_sur_deux_axes() -> None:
    points = [PointEvolution(202609, Decimal("4399080"), 969, 0, Decimal(0))]
    svg = graphique_evolution(points)
    assert svg.startswith('<div class="graphique-evolution"') and "<svg" in svg
    assert "Effectif (personnes)" in svg and "Montant de la paie (DH)" in svg
    assert "9/2026" in svg
    assert graphique_evolution([]) == ""


def test_echelle_entiere_ne_graduee_jamais_en_fraction_de_personne() -> None:
    assert _echelle(1, entiere=True) == 5
    assert _echelle(969, entiere=True) == 1000


def test_repartition_unique_a_deux_barres_donne_valeur_exacte_et_pourcentage_et_regroupe_le_reste() -> None:
    parts = [(f"Chantier {index}", float(100 - index), float(5000 - index)) for index in range(30)]
    svg = graphique_repartition(parts, hauteur_repartition(len(parts)))
    assert "100 (" in svg and f"5{chr(0xA0)}000 (" in svg and " %)" in svg
    assert "Effectif (personnes)" in svg and "Montant de la paie (DH)" in svg
    assert "Chantier 0" in svg and "Autres" in svg and "Chantier 29" not in svg
    assert graphique_repartition([("A", 0.0, 0.0)], 100) == ""
    assert nombre_parts(parts) == 21
