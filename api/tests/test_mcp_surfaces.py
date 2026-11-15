"""Surfaces A2UI des outils MCP (KAN-80) : chaque outil de liste déclare les colonnes de son tableau."""

from typing import Any

from staport.domains.mcp.outils_employe import colonnes_employes
from staport.domains.mcp.surfaces import CATALOGUE_ERP, CLE_OPERATIONS, Colonne, avec_surface, surface

COLONNES = (Colonne("code", "Code"), Colonne("effectif", "Effectif", "nombre", barre=True), Colonne("f.libelle", "F"))
LIGNES: list[dict[str, Any]] = [
    {"id": i, "code": f"CH{i}", "effectif": 10 * i, "f": {"id": 9, "libelle": f"Fonction {i}"}, "interne": "secret"}
    for i in range(1, 6)
]


def _composants(operations: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {c["id"]: c for c in operations[1]["updateComponents"]["components"]}


def test_une_liste_longue_rend_un_tableau_aux_seules_colonnes_declarees() -> None:
    operations = surface("employes_regrouper", "Effectif", LIGNES, COLONNES, legende="Période 2026-09")[CLE_OPERATIONS]

    assert operations[0]["createSurface"]["catalogId"] == CATALOGUE_ERP
    tableau = _composants(operations)["root"]
    assert tableau["component"] == "DataTable" and tableau["rows"] == {"path": "/lignes"}
    assert tableau["caption"] == "Période 2026-09"
    assert [c["key"] for c in tableau["columns"]] == ["code", "effectif", "f.libelle"]
    assert tableau["columns"][1] == {"key": "effectif", "label": "Effectif", "format": "nombre", "bar": True}
    ligne = operations[2]["updateDataModel"]["value"]["lignes"][0]
    assert ligne == {"code": "CH1", "effectif": 10, "f.libelle": "Fonction 1"}  # ni id ni champ imprévu


def test_une_liste_courte_reste_en_texte() -> None:
    assert surface("x", "T", LIGNES[:3], COLONNES) == {}


def test_une_suite_de_mois_donne_une_courbe_dans_l_ordre_du_temps() -> None:
    mois = [{"periode": f"2026-0{m}", "masse": m * 100.5} for m in (9, 8, 7, 6)]
    colonnes = (Colonne("periode", "Période", "periode"), Colonne("masse", "Montant de la paie", "montant"))

    composants = _composants(surface("paie_evolution", "Évolution", mois, colonnes, courbe=True)[CLE_OPERATIONS])

    assert composants["root"]["children"] == ["graphique", "tableau"]
    assert composants["graphique"]["labels"] == ["2026-06", "2026-07", "2026-08", "2026-09"]
    assert composants["graphique"]["series"] == [
        {"name": "Montant de la paie", "values": [603.0, 703.5, 804.0, 904.5], "format": "montant"}
    ]


def test_le_resultat_garde_ses_champs_et_la_legende_vient_de_la_periode() -> None:
    resultat = {"periode": "2026-09", "groupes": LIGNES}

    complet = avec_surface(resultat, "paie_repartition", "Paie", "groupes", COLONNES, legende_periode=True)

    assert complet["groupes"] == LIGNES and complet["periode"] == "2026-09"
    assert _composants(complet[CLE_OPERATIONS])["root"]["caption"] == "Période 2026-09"
    assert avec_surface({"groupes": LIGNES[:2]}, "x", "T", "groupes", COLONNES) == {"groupes": LIGNES[:2]}


def test_le_salaire_n_est_une_colonne_que_pour_qui_voit_la_paie() -> None:
    avec = {c.cle for c in colonnes_employes(True)}
    sans = {c.cle for c in colonnes_employes(False)}

    assert {"salaire", "typeSalaire"} <= avec
    assert not {"salaire", "typeSalaire"} & sans
    assert sans <= avec
