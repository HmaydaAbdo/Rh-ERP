# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Évaluation hors ligne (docs/ia.md, T12) : le vrai client ``ChatLiteLLM`` et la vraie boucle ``create_agent`` face à
une passerelle simulée par CopilotKit ``aimock`` — aucun réseau, aucun quota, résultat déterministe.

Chaque scénario scripte les appels successifs du modèle (``sequenceIndex``) et vérifie ce que l'agent en fait : réponse
directe, appel d'outil puis réponse, comportement sans vérificateur, tag de tâche transmis à LiteLLM.
"""

from typing import Any

import pytest
from doubles import INDICATEURS, outil
from langchain_core.messages import HumanMessage

from erp_rh_ia.agent import creer_agent
from erp_rh_ia.config import Settings
from erp_rh_ia.modeles import Tache, modele

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _config(aimock: Any) -> Settings:
    return Settings(
        enabled=True,
        litellm_base_url=f"{aimock.url}/v1",  # pyright: ignore[reportArgumentType]
        litellm_api_key="sk-test-cle",  # pyright: ignore[reportArgumentType]
        erp_api_url="http://backend:8080",  # pyright: ignore[reportArgumentType]
    )


def _scenario(aimock: Any, question: str, *reponses: dict[str, Any]) -> None:
    """Réponses successives à la question."""
    aimock.reset()
    for index, reponse in enumerate(reponses):
        aimock.add_fixture(match={"userMessage": question, "sequenceIndex": index}, response=reponse)


async def _repondre(aimock: Any, question: str, appels: list[str]) -> dict[str, Any]:
    agent = creer_agent(modele(_config(aimock), Tache.COMPLEX), [outil("paie_indicateurs", INDICATEURS, appels)])
    return await agent.ainvoke({"messages": [HumanMessage(content=question)]})


async def test_un_message_simple_est_repondu_en_un_appel(aimock: Any) -> None:
    _scenario(aimock, "Bonjour", {"content": "Bonjour ! Je réponds à vos questions RH."})
    appels: list[str] = []

    etat = await _repondre(aimock, "Bonjour", appels)

    assert etat["messages"][-1].content == "Bonjour ! Je réponds à vos questions RH."
    assert appels == [] and len(aimock.get_journal()) == 1


async def test_une_question_de_donnees_appelle_l_outil_puis_repond(aimock: Any) -> None:
    question = "Masse salariale de 2026-09 ?"
    _scenario(
        aimock,
        question,
        {"toolCalls": [{"name": "paie_indicateurs", "arguments": {"periode": "2026-09"}}]},
        {"content": "En 2026-09 : masse 1 250 000,50 MAD."},
    )
    appels: list[str] = []

    etat = await _repondre(aimock, question, appels)

    assert appels == ["paie_indicateurs"]
    assert etat["messages"][-1].content == "En 2026-09 : masse 1 250 000,50 MAD."
    # Le groupe de capacité et le tag de suivi arrivent à la passerelle ; le prompt système part avec chaque appel.
    requete = aimock.get_journal()[0]["body"]
    assert requete["model"] == "ai-gateway-complex"
    assert requete["metadata"] == {"tags": ["complex"]}
    assert requete["messages"][0]["role"] == "system"
