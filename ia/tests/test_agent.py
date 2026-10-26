# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Agent ``create_agent`` et faux modèle de LangChain : forme de réponse, outils, plan, vérificateur de chiffres."""

from typing import Any

import pytest
from doubles import INDICATEURS, appel, modele, outil
from langchain_core.messages import AIMessage, HumanMessage

from erp_rh_ia.agent import ABSTENTION, OUTIL_A2UI, creer_agent


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


pytestmark = pytest.mark.anyio


async def _repondre(
    agent_modele: object, question: str, appels: list[str] | None = None, surface: dict[str, Any] | None = None
) -> dict[str, Any]:
    outils = [outil("paie_indicateurs", INDICATEURS, appels)]
    if surface is not None:
        # L'outil d'interface composée, tel que CopilotKitMiddleware l'injecte : il rend une enveloppe A2UI.
        outils.append(outil(OUTIL_A2UI, surface))
    agent = creer_agent(agent_modele, outils)  # pyright: ignore[reportArgumentType]
    return await agent.ainvoke({"messages": [HumanMessage(content=question)]})


def _surface(masse: float) -> dict[str, Any]:
    """Une enveloppe A2UI v0.9 : une étiquette liée à la masse du modèle de données."""
    return {
        "a2ui_operations": [
            {"version": "v0.9", "createSurface": {"surfaceId": "s1", "catalogId": "basic"}},
            {
                "version": "v0.9",
                "updateComponents": {
                    "surfaceId": "s1",
                    "components": [{"id": "t1", "component": "Text", "text": {"path": "/masse"}}],
                },
            },
            {"version": "v0.9", "updateDataModel": {"surfaceId": "s1", "path": "/", "value": {"masse": masse}}},
        ]
    }


async def test_un_message_simple_recoit_une_reponse_directe_sans_outil() -> None:
    appels: list[str] = []
    faux = modele(AIMessage(content="Bonjour ! Je réponds à vos questions RH."))

    etat = await _repondre(faux, "Bonjour", appels)

    assert etat["messages"][-1].content == "Bonjour ! Je réponds à vos questions RH."  # pyright: ignore[reportIndexIssue,reportAttributeAccessIssue]
    assert etat["verification"] == "verifiee"
    assert appels == [] and len(faux.vus) == 1  # un seul appel de modèle


async def test_une_reponse_fondee_sur_les_outils_est_verifiee() -> None:
    appels: list[str] = []
    faux = modele(
        appel("paie_indicateurs", periode="2026-09"), AIMessage(content="En 2026-09 : masse 1 250 000,50 MAD.")
    )

    etat = await _repondre(faux, "Masse salariale de 2026-09 ?", appels)

    assert appels == ["paie_indicateurs"]
    assert etat["verification"] == "verifiee"
    assert etat["messages"][-1].content == "En 2026-09 : masse 1 250 000,50 MAD."  # pyright: ignore[reportIndexIssue,reportAttributeAccessIssue]


async def test_un_chiffre_invente_est_retire_puis_reecrit_une_fois() -> None:
    faux = modele(
        appel("paie_indicateurs"),
        AIMessage(content="La masse a augmenté de 7 %."),
        AIMessage(content="La masse est de 1 250 000,50 MAD."),
    )

    etat = await _repondre(faux, "Évolution de la masse ?")

    textes = [m.content for m in etat["messages"] if isinstance(m, AIMessage)]  # pyright: ignore[reportAttributeAccessIssue,reportGeneralTypeIssues]
    assert "La masse a augmenté de 7 %." not in textes  # le brouillon faux a quitté la conversation
    assert textes[-1] == "La masse est de 1 250 000,50 MAD."
    assert etat["verification"] == "verifiee"
    # La consigne de réécriture, qui cite le nombre inconnu, n'a servi qu'au troisième appel.
    assert "7" in faux.vus[2][-1].text
    assert not any("Réécris" in m.text for m in etat["messages"])  # pyright: ignore[reportAttributeAccessIssue,reportGeneralTypeIssues]


async def test_des_chiffres_toujours_inventes_donnent_une_abstention() -> None:
    faux = modele(appel("paie_indicateurs"), AIMessage(content="Hausse de 7 %."), AIMessage(content="Hausse de 13 %."))

    etat = await _repondre(faux, "Évolution de la masse ?")

    assert etat["messages"][-1].content == ABSTENTION  # pyright: ignore[reportIndexIssue,reportAttributeAccessIssue]
    assert etat["verification"] == "abstention"


async def test_un_chiffre_de_la_question_est_admis() -> None:
    faux = modele(AIMessage(content="Je n'ai pas de donnée pour 2026-09."))

    etat = await _repondre(faux, "Et pour 2026-09 ?")

    assert etat["verification"] == "verifiee"


async def test_le_plan_et_les_outils_metier_sont_proposes_au_modele() -> None:
    faux = modele(AIMessage(content="Bonjour."))

    await _repondre(faux, "Bonjour")

    assert {"write_todos", "paie_indicateurs"} <= set(faux.outils_lies[-1])


async def test_une_surface_a2ui_fondee_sur_les_outils_est_verifiee() -> None:
    faux = modele(appel("paie_indicateurs"), appel(OUTIL_A2UI), AIMessage(content="Voici la masse de 2026-09."))

    etat = await _repondre(faux, "Montre la masse", surface=_surface(1250000.5))

    assert etat["verification"] == "verifiee"


async def test_un_chiffre_invente_dans_la_surface_donne_une_abstention() -> None:
    # La surface n'est jamais une source : reprendre son chiffre inventé dans le texte ne le rend pas valable.
    faux = modele(
        appel("paie_indicateurs"),
        appel(OUTIL_A2UI),
        AIMessage(content="La masse est de 999 MAD."),
        AIMessage(content="Voici le tableau."),
    )

    etat = await _repondre(faux, "Montre la masse", surface=_surface(999))

    assert etat["verification"] == "abstention"
    assert etat["messages"][-1].content == ABSTENTION  # pyright: ignore[reportIndexIssue,reportAttributeAccessIssue]
