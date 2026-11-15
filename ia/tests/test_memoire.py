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
import sys
import uuid

import pytest
from doubles import modele
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.store.postgres.aio import AsyncPostgresStore

from staport_ia.agent import creer_agent
from staport_ia.competences import ESPACE_COMPETENCES, semer_competences
from staport_ia.memoire import espace_conversation, ouvrir_memoire, sujet

URL = os.environ.get("IA_TEST_DATABASE_URL")


@pytest.fixture(scope="module")
def event_loop_policy() -> asyncio.AbstractEventLoopPolicy:
    # psycopg asynchrone refuse la boucle Proactor de Windows (le service tourne sous Linux, en conteneur).
    return asyncio.WindowsSelectorEventLoopPolicy() if sys.platform == "win32" else asyncio.DefaultEventLoopPolicy()


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


async def test_sans_base_la_memoire_du_processus_garde_aussi_les_fichiers_par_identite() -> None:
    async with ouvrir_memoire(None) as memoire:
        await memoire.store.aput(("rh", "espace"), "/rapport.md", {"content": "a"})
        assert (await memoire.store.aget(("rh", "espace"), "/rapport.md")) is not None
        assert (await memoire.store.aget(("comptable", "espace"), "/rapport.md")) is None


@pytest.mark.skipif(URL is None, reason="IA_TEST_DATABASE_URL absent")
async def test_les_fichiers_d_espace_survivent_a_un_redemarrage_et_restent_prives() -> None:
    cle = f"/rapport-{uuid.uuid4().hex}.md"
    async with ouvrir_memoire(URL) as memoire:
        await memoire.store.aput(("rh", "espace"), cle, {"content": "Masse de septembre"})

    async with ouvrir_memoire(URL) as memoire:  # « redémarrage » : nouvelle connexion
        chez_rh = await memoire.store.aget(("rh", "espace"), cle)
        chez_autre = await memoire.store.aget(("comptable", "espace"), cle)
        await memoire.store.adelete(("rh", "espace"), cle)

    assert chez_rh is not None and chez_rh.value["content"] == "Masse de septembre"
    assert chez_autre is None


@pytest.mark.skipif(URL is None, reason="IA_TEST_DATABASE_URL absent")
async def test_les_fiches_de_competences_sont_semees_dans_le_store_postgresql_et_lisibles() -> None:
    """KAN-259 : le modèle lit les fiches dans le Store, jamais sur le disque ; le semis est répétable."""
    async with ouvrir_memoire(URL) as memoire:
        await semer_competences(memoire.store)
        await semer_competences(memoire.store)  # idempotent
        fiche = await memoire.store.aget(ESPACE_COMPETENCES, "/paie/SKILL.md")
    assert fiche is not None and "paie" in str(fiche.value["content"])


@pytest.mark.skipif(URL is None, reason="IA_TEST_DATABASE_URL absent")
async def test_un_fichier_d_espace_expire_par_le_balayeur_natif_du_store() -> None:
    """KAN-73 : l'expiration est celle du Store officiel (``TTLConfig``), sans tâche pg_cron à nous."""
    cle = f"/expire-{uuid.uuid4().hex}.md"
    async with ouvrir_memoire(URL) as memoire:
        store = memoire.store
        assert isinstance(store, AsyncPostgresStore)
        await store.aput(("rh", "espace"), cle, {"content": "à effacer"}, ttl=0.01)  # 0,6 seconde
        await asyncio.sleep(1.5)
        await store.sweep_ttl()
        assert await store.aget(("rh", "espace"), cle) is None


@pytest.mark.skipif(URL is None, reason="IA_TEST_DATABASE_URL absent")
async def test_une_conversation_reprend_apres_un_redemarrage_et_reste_privee() -> None:
    fil = uuid.uuid4().hex
    config: RunnableConfig = {"configurable": {"thread_id": espace_conversation("rh", fil)}}
    autre_config: RunnableConfig = {"configurable": {"thread_id": espace_conversation("comptable", fil)}}
    async with ouvrir_memoire(URL) as memoire:
        faux = modele(AIMessage(content="Bonjour."))
        agent = creer_agent(faux, [], checkpointer=memoire.checkpointer)  # pyright: ignore[reportArgumentType]
        await agent.ainvoke({"messages": [HumanMessage(content="Salut")]}, config)

    async with ouvrir_memoire(URL) as memoire:  # « redémarrage » : nouvelle connexion, nouvel agent
        faux = modele(AIMessage(content="Encore."))
        agent = creer_agent(faux, [], checkpointer=memoire.checkpointer)  # pyright: ignore[reportArgumentType]
        etat = await agent.aget_state(config)
        autre = await agent.aget_state(autre_config)

    assert [m.text for m in etat.values["messages"]] == ["Salut", "Bonjour."]
    assert not autre.values
