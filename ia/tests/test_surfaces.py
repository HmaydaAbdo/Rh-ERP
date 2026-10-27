# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Surfaces déterministes : une liste rendue par un outil s'affiche en tableau sans passer par le modèle."""

import json
from typing import Any

import pytest
from doubles import appel, modele
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import StructuredTool

from erp_rh_ia.agent import creer_agent
from erp_rh_ia.surfaces import CATALOGUE_ERP, operations_pour, resultat_sans_surface


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


LIGNES: list[dict[str, Any]] = [
    {"id": i, "code": f"CH{i}", "libelle": f"Chantier {i}", "effectif": 10 * i, "enPoste": 9 * i} for i in range(1, 6)
]
GROUPES: dict[str, Any] = {
    "dimension": "CHANTIER",
    "nombreGroupes": 5,
    "groupes": LIGNES,
    "vue": {"module": "employees", "vue": "cartes", "parametres": {}},
}

EVOLUTION: dict[str, Any] = {
    "mois": [
        {"periode": "2026-09", "masse": 300.5, "effectif": 30},
        {"periode": "2026-08", "masse": 200.5, "effectif": 20},
        {"periode": "2026-07", "masse": 100.5, "effectif": 10},
        {"periode": "2026-06", "masse": 50.5, "effectif": 5},
    ]
}


def _composants(operations: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {c["id"]: c for c in operations[1]["updateComponents"]["components"]}


def test_une_liste_longue_devient_un_tableau_lie_au_modele_de_donnees() -> None:
    operations = operations_pour("employes_regrouper", GROUPES)

    assert operations is not None
    assert operations[0]["createSurface"]["catalogId"] == CATALOGUE_ERP
    tableau = _composants(operations)["root"]
    assert tableau["component"] == "DataTable"
    assert tableau["rows"] == {"path": "/lignes"}
    assert [c["key"] for c in tableau["columns"]] == ["code", "libelle", "effectif", "enPoste"]  # ni id ni vue
    assert {c["key"]: c["format"] for c in tableau["columns"]}["effectif"] == "nombre"
    assert operations[2]["updateDataModel"]["value"]["lignes"][0]["libelle"] == "Chantier 1"


def test_une_suite_de_mois_donne_une_courbe_dans_l_ordre_du_temps() -> None:
    operations = operations_pour("paie_evolution", EVOLUTION)

    assert operations is not None
    composants = _composants(operations)
    graphique = composants["graphique"]
    assert composants["root"]["children"] == ["graphique", "tableau"]
    assert graphique["labels"] == ["2026-06", "2026-07", "2026-08", "2026-09"]
    masse = {"name": "Masse salariale", "values": [50.5, 100.5, 200.5, 300.5], "format": "montant"}
    assert graphique["series"][0] == masse
    assert {c["key"]: c["format"] for c in composants["tableau"]["columns"]}["periode"] == "periode"


def test_une_liste_courte_ou_un_resultat_sans_liste_reste_en_texte() -> None:
    assert operations_pour("employes_regrouper", {**GROUPES, "groupes": LIGNES[:3]}) is None
    assert operations_pour("paie_indicateurs", {"periode": "2026-09", "indicateurs": {"masse": 1}}) is None
    assert operations_pour("x", None) is None


def test_le_modele_retrouve_le_resultat_d_origine() -> None:
    enveloppe = json.dumps({"a2ui_operations": [], "resultat": '{"a": 1}'})

    assert resultat_sans_surface(enveloppe) == '{"a": 1}'
    assert resultat_sans_surface('{"a": 1}') == '{"a": 1}'


@pytest.mark.anyio
async def test_l_agent_affiche_le_tableau_et_le_modele_ne_voit_que_les_donnees() -> None:
    async def regrouper(**_: Any) -> tuple[str, dict[str, Any]]:
        return json.dumps(GROUPES), {"structured_content": GROUPES}

    outil = StructuredTool(
        name="employes_regrouper",
        description="Effectif par chantier",
        args_schema={"type": "object", "properties": {}},
        coroutine=regrouper,
        response_format="content_and_artifact",
    )
    faux = modele(appel("employes_regrouper"), AIMessage(content="Le chantier 5 compte 50 employés."))
    agent = creer_agent(faux, [outil])  # pyright: ignore[reportArgumentType]

    etat = await agent.ainvoke({"messages": [HumanMessage(content="Effectif par chantier ?")]})

    resultat = next(m for m in etat["messages"] if isinstance(m, ToolMessage))
    composants = json.loads(resultat.text)["a2ui_operations"][1]["updateComponents"]["components"]
    assert composants[0]["component"] == "DataTable"
    vu = next(m for m in faux.vus[1] if isinstance(m, ToolMessage))
    assert json.loads(vu.text) == GROUPES
    assert etat["verification"] == "verifiee"
