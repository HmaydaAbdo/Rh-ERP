# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Surfaces A2UI : l'outil décrit son tableau (KAN-80), le service le transmet et le modèle ne voit que les données."""

import json
from typing import Any

from doubles import appel, modele
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import StructuredTool

from staport_ia.agent import creer_agent
from staport_ia.surfaces import resultat_sans_surface

LIGNES: list[dict[str, Any]] = [{"code": f"CH{i}", "effectif": 10 * i} for i in range(1, 6)]
OPERATIONS: list[dict[str, Any]] = [
    {"version": "v0.9", "createSurface": {"surfaceId": "s", "catalogId": "staport-intelligence://a2ui/catalogue-erp"}},
    {
        "version": "v0.9",
        "updateComponents": {"surfaceId": "s", "components": [{"id": "root", "component": "DataTable"}]},
    },
    {"version": "v0.9", "updateDataModel": {"surfaceId": "s", "path": "/", "value": {"lignes": LIGNES}}},
]
GROUPES: dict[str, Any] = {"dimension": "CHANTIER", "groupes": LIGNES}


def _outil(nom: str, donnees: dict[str, Any]) -> StructuredTool:
    async def appeler(**_: Any) -> tuple[str, dict[str, Any]]:
        return json.dumps(donnees), {"structured_content": donnees}

    return StructuredTool(
        name=nom,
        description="Effectif par chantier",
        args_schema={"type": "object", "properties": {}},
        coroutine=appeler,
        response_format="content_and_artifact",
    )


def test_le_modele_retrouve_le_resultat_d_origine() -> None:
    enveloppe = json.dumps({"a2ui_operations": [], "resultat": '{"a": 1}'})

    assert resultat_sans_surface(enveloppe) == '{"a": 1}'
    assert resultat_sans_surface('{"a": 1}') == '{"a": 1}'


async def test_l_agent_transmet_la_surface_de_l_outil_et_le_modele_ne_voit_que_les_donnees() -> None:
    outil = _outil("employes_regrouper", {**GROUPES, "a2ui_operations": OPERATIONS})
    faux = modele(appel("employes_regrouper"), AIMessage(content="Le chantier 5 compte 50 employés."))
    agent = creer_agent(faux, [outil])  # pyright: ignore[reportArgumentType]

    etat = await agent.ainvoke(
        {"messages": [HumanMessage(content="Effectif par chantier ?")], "pinned_skills": ["employes"]}
    )

    resultat = next(m for m in etat["messages"] if isinstance(m, ToolMessage))
    assert json.loads(resultat.text)["a2ui_operations"] == OPERATIONS
    vu = next(m for m in faux.vus[1] if isinstance(m, ToolMessage))
    assert json.loads(vu.text) == GROUPES  # ni opérations ni doublon des lignes


async def test_un_outil_sans_surface_rend_son_resultat_tel_quel() -> None:
    outil = _outil("employes_regrouper", GROUPES)
    faux = modele(appel("employes_regrouper"), AIMessage(content="Cinq chantiers."))
    agent = creer_agent(faux, [outil])  # pyright: ignore[reportArgumentType]

    etat = await agent.ainvoke(
        {"messages": [HumanMessage(content="Effectif par chantier ?")], "pinned_skills": ["employes"]}
    )

    resultat = next(m for m in etat["messages"] if isinstance(m, ToolMessage))
    assert json.loads(resultat.text) == GROUPES
