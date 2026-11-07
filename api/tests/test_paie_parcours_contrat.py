"""Contrat du parcours : Angular lit `indicateurs` imbriqué, comme `ParcoursEmployeDto` de Spring."""
# ruff: noqa: F811  (les fixtures `jeu` et `entetes` importées de test_heuresupp sont reprises par nom)

from conftest import Plateforme
from test_heuresupp import MOIS, Jeu, entetes, jeu  # noqa: F401  # pyright: ignore[reportUnusedImport, reportPrivateUsage]


def test_le_parcours_imbrique_ses_indicateurs(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    reponse = plateforme.client.get(f"/paie/employes/{jeu.employes[0]}/parcours", headers=entetes)

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert set(corps) == {"employeId", "indicateurs", "mois", "evenements"}
    assert set(corps["indicateurs"]) == {"moisPayes", "totalPercu", "joursTravailles", "premierMois", "dernierMois"}
    assert corps["indicateurs"]["moisPayes"] == len(corps["mois"]) >= 1
    assert corps["indicateurs"]["premierMois"] == MOIS
    assert isinstance(corps["indicateurs"]["totalPercu"], int | float)
