# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Conversations durables : fils propres à l'utilisateur et reprise après un redémarrage de l'IA.

Les tests PostgreSQL ne tournent que si ``IA_TEST_DATABASE_URL`` désigne une base jetable (la CI n'en fournit pas) ;
ils créent les tables officielles du checkpointer et utilisent un fil unique par exécution.
"""

import asyncio
import base64
import json
import os
import uuid

import pytest
from doubles import modele
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig

from erp_rh_ia.agent import creer_agent
from erp_rh_ia.memoire import espace_conversation, ouvrir_memoire, sujet

URL = os.environ.get("IA_TEST_DATABASE_URL")


@pytest.fixture
def anyio_backend() -> tuple[str, dict[str, object]]:
    # psycopg asynchrone refuse la boucle Proactor de Windows (le service tourne sous Linux, en conteneur).
    return "asyncio", {"loop_factory": asyncio.SelectorEventLoop}


def _jeton(sub: str) -> str:
    charge = base64.urlsafe_b64encode(json.dumps({"sub": sub}).encode()).decode().rstrip("=")
    return f"entete.{charge}.signature"


def test_le_fil_est_prefixe_par_l_identite_du_jeton_agent() -> None:
    assert sujet(_jeton("rh")) == "rh"
    assert espace_conversation("rh", "t1") == "rh:t1"
    assert espace_conversation("rh", "t1") != espace_conversation("comptable", "t1")


def test_un_jeton_illisible_donne_un_espace_propre_a_ce_jeton() -> None:
    assert sujet("pas-un-jwt") == sujet("pas-un-jwt")
    assert sujet("pas-un-jwt") != sujet("un-autre")
    assert sujet("pas-un-jwt").startswith("anonyme-")


@pytest.mark.anyio
@pytest.mark.skipif(URL is None, reason="IA_TEST_DATABASE_URL absent")
async def test_une_conversation_reprend_apres_un_redemarrage_et_reste_privee() -> None:
    fil = uuid.uuid4().hex
    config: RunnableConfig = {"configurable": {"thread_id": espace_conversation("rh", fil)}}
    autre_config: RunnableConfig = {"configurable": {"thread_id": espace_conversation("comptable", fil)}}
    async with ouvrir_memoire(URL) as memoire:
        faux = modele(AIMessage(content="Bonjour."))
        agent = creer_agent(faux, [], checkpointer=memoire)  # pyright: ignore[reportArgumentType]
        await agent.ainvoke({"messages": [HumanMessage(content="Salut")]}, config)

    async with ouvrir_memoire(URL) as memoire:  # « redémarrage » : nouvelle connexion, nouvel agent
        faux = modele(AIMessage(content="Encore."))
        agent = creer_agent(faux, [], checkpointer=memoire)  # pyright: ignore[reportArgumentType]
        etat = await agent.aget_state(config)
        autre = await agent.aget_state(autre_config)

    assert [m.text for m in etat.values["messages"]] == ["Salut", "Bonjour."]
    assert not autre.values
