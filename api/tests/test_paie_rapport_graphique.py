from decimal import Decimal

from staport.domains.paie.rapport_graphique import _echelle, graphique_evolution, graphique_repartition  # pyright: ignore[reportPrivateUsage]
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


def test_repartition_donne_valeur_exacte_et_pourcentage_et_regroupe_le_reste() -> None:
    parts = [(f"Chantier {index}", float(100 - index)) for index in range(30)]
    svg = graphique_repartition("Effectif par chantier", parts, "#3987E5")
    assert "Chantier 0 : 100 (" in svg and " %)" in svg
    assert "Autres : " in svg and "Chantier 29" not in svg
    assert graphique_repartition("vide", [("A", 0.0)], "#3987E5") == ""
