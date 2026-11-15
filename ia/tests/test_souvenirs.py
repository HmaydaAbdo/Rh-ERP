# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces règles sont levées.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Mémoire longue (KAN-84) : consentement, consultation, correction, oubli, isolation et expiration."""

import asyncio
import os
import uuid
from collections.abc import Sequence
from typing import Any

import pytest
from doubles import INDICATEURS, appel, memoire_processus, modele, outil, store_avec_competences
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.store.postgres.aio import AsyncPostgresStore
from langgraph.types import Command
from test_agui import AccesSimule, _routage_paie, _settings  # pyright: ignore[reportPrivateUsage]

from staport_ia.agent import creer_agent
from staport_ia.app import creer_app
from staport_ia.fichiers import FICHIER_MEMOIRE, TAILLE_MAX_MEMOIRE
from staport_ia.memoire import ouvrir_memoire, sujet

URL = os.environ.get("IA_TEST_DATABASE_URL")
FAIT = "- Je suis responsable du chantier Atlas."
_DEMANDE: Any = {"messages": [HumanMessage(content="Retiens que je suis responsable du chantier Atlas.")]}


def _fil(nom: str) -> Any:
    return {"configurable": {"thread_id": nom}}


def _agent(utilisateur: str, store: InMemoryStore, *reponses: AIMessage, saver: Any = None) -> Any:
    faux = modele(*reponses)
    agent: Any = creer_agent(
        faux,  # pyright: ignore[reportArgumentType]
        [outil("paie_indicateurs", INDICATEURS)],  # pyright: ignore[reportArgumentType]
        checkpointer=saver or InMemorySaver(),
        utilisateur=utilisateur,
        store=store,
    )
    agent.faux = faux
    return agent


def _retenir(contenu: str = FAIT, outil_ecriture: str = "write_file") -> AIMessage:
    argument = {"content": contenu} if outil_ecriture == "write_file" else {"old_string": "", "new_string": contenu}
    return appel(outil_ecriture, file_path=FICHIER_MEMOIRE, **argument)


async def test_retenir_attend_l_accord_puis_ecrit_dans_l_espace_de_l_utilisateur() -> None:
    store = store_avec_competences()
    agent = _agent("rh", store, _retenir(), AIMessage(content="C'est noté."))

    en_pause = await agent.ainvoke(_DEMANDE, _fil("t1"))

    assert en_pause["__interrupt__"]
    assert await store.aget(("rh", "memoire"), "/AGENTS.md") is None  # rien n'est retenu avant l'accord

    await agent.ainvoke(Command(resume={"decisions": [{"type": "approve"}]}), _fil("t1"))

    retenu = await store.aget(("rh", "memoire"), "/AGENTS.md")
    assert retenu is not None and FAIT in str(retenu.value["content"])
    assert await store.aget(("comptable", "memoire"), "/AGENTS.md") is None  # propre à l'identité


async def test_un_refus_de_l_utilisateur_ne_retient_rien() -> None:
    store = store_avec_competences()
    agent = _agent("rh", store, _retenir(), AIMessage(content="Je n'ai rien retenu."))
    await agent.ainvoke(_DEMANDE, _fil("t1"))

    await agent.ainvoke(Command(resume={"decisions": [{"type": "reject", "message": "Non."}]}), _fil("t1"))

    assert await store.aget(("rh", "memoire"), "/AGENTS.md") is None


async def test_la_memoire_est_relue_dans_une_autre_conversation_et_jamais_chez_un_autre_utilisateur() -> None:
    store = store_avec_competences()
    store.put(("rh", "memoire"), "/AGENTS.md", {"content": FAIT, "encoding": "utf-8"})

    chez_rh = _agent("rh", store, AIMessage(content="Bonjour."))
    chez_autre = _agent("comptable", store, AIMessage(content="Bonjour."))
    await chez_rh.ainvoke({"messages": [HumanMessage(content="Salut")]}, _fil("nouveau-fil"))
    await chez_autre.ainvoke({"messages": [HumanMessage(content="Salut")]}, _fil("nouveau-fil"))

    vu_rh = "\n".join(str(m.content) for m in chez_rh.faux.vus[0])
    vu_autre = "\n".join(str(m.content) for m in chez_autre.faux.vus[0])
    assert "chantier Atlas" in vu_rh
    assert "chantier Atlas" not in vu_autre


@pytest.mark.parametrize(
    ("chemin", "contenu", "motif"),
    [
        (FICHIER_MEMOIRE, "x" * (TAILLE_MAX_MEMOIRE + 1), "trop longue"),
        ("/memoire/autre.md", "x", "seul fichier"),
    ],
)
async def test_la_memoire_reste_courte_et_unique(chemin: str, contenu: str, motif: str) -> None:
    store = store_avec_competences()
    agent = _agent("rh", store, appel("write_file", file_path=chemin, content=contenu), AIMessage(content="Fait."))
    await agent.ainvoke(_DEMANDE, _fil("t1"))

    fini = await agent.ainvoke(Command(resume={"decisions": [{"type": "approve"}]}), _fil("t1"))

    message = next(m for m in reversed(fini["messages"]) if m.type == "tool")
    assert motif in str(message.content)
    assert await store.aget(("rh", "memoire"), "/AGENTS.md") is None


def _client(store: InMemoryStore, acces: AccesSimule) -> TestClient:
    def fabrique(outils: Sequence[BaseTool], checkpointer: BaseCheckpointSaver[Any] | None, utilisateur: str) -> Any:
        return creer_agent(
            modele(AIMessage(content="ok")), outils, checkpointer=checkpointer, utilisateur=utilisateur, store=store
        )  # pyright: ignore[reportArgumentType]

    return TestClient(
        creer_app(_settings(), fabrique=fabrique, acces=acces, routage=_routage_paie, memoire=memoire_processus)
    )


def _entetes(jeton: str = "c") -> dict[str, str]:
    return {"Authorization": f"Bearer {jeton}"}


def test_consulter_corriger_et_oublier_sa_memoire() -> None:
    acces = AccesSimule([])
    with _client(store_avec_competences(), acces) as client:
        vide = client.get("/memoire", headers=_entetes())
        corrige = client.put("/memoire", json={"contenu": FAIT}, headers=_entetes())
        lue = client.get("/memoire", headers=_entetes())
        oublie = client.delete("/memoire", headers=_entetes())
        apres = client.get("/memoire", headers=_entetes())

    assert vide.json() == {"contenu": "", "modifie": None}
    assert corrige.status_code == 204 and lue.json()["contenu"] == FAIT and lue.json()["modifie"]
    assert oublie.status_code == 204 and apres.json()["contenu"] == ""
    # Chaque modification est journalisée (chemin, taille, action ; jamais le contenu).
    assert acces.ecritures == [
        ("jeton-agent", FICHIER_MEMOIRE, len(FAIT), "memoire_modifier"),
        ("jeton-agent", FICHIER_MEMOIRE, 0, "memoire_oublier"),
    ]


def test_un_contenu_vide_oublie_tout_et_un_contenu_trop_long_est_refuse() -> None:
    with _client(store_avec_competences(), AccesSimule([])) as client:
        client.put("/memoire", json={"contenu": FAIT}, headers=_entetes())
        trop_long = client.put("/memoire", json={"contenu": "x" * (TAILLE_MAX_MEMOIRE + 1)}, headers=_entetes())
        vide = client.put("/memoire", json={"contenu": "  \n"}, headers=_entetes())
        apres = client.get("/memoire", headers=_entetes())

    assert trop_long.status_code == 422
    assert vide.status_code == 204 and apres.json()["contenu"] == ""


def test_la_memoire_d_un_utilisateur_n_est_visible_que_de_lui_et_exige_une_connexion() -> None:
    with _client(store_avec_competences(), AccesSimule([])) as client:
        store = client.app.state.store  # type: ignore[attr-defined]  # le Store du service, celui des routes
        store.put(("autre-utilisateur", "memoire"), "/AGENTS.md", {"content": "SECRET", "encoding": "utf-8"})
        store.put((sujet("jeton-agent"), "memoire"), "/AGENTS.md", {"content": FAIT, "encoding": "utf-8"})
        proprietaire = client.get("/memoire", headers=_entetes())
        client.delete("/memoire", headers=_entetes())
        sans_jeton = client.get("/memoire")
        sans_jeton_ecriture = client.put("/memoire", json={"contenu": "x"})
        autre = store.get(("autre-utilisateur", "memoire"), "/AGENTS.md")

    assert proprietaire.json()["contenu"] == FAIT
    assert sans_jeton.status_code == 401 and sans_jeton_ecriture.status_code == 401
    assert autre is not None and autre.value["content"] == "SECRET"  # l'oubli d'un utilisateur ne touche pas l'autre


@pytest.mark.skipif(URL is None, reason="IA_TEST_DATABASE_URL absent")
async def test_la_memoire_expire_par_le_balayeur_natif_du_store() -> None:
    """KAN-84 : l'expiration de la mémoire est celle du Store officiel (``TTLConfig``), sans tâche à nous."""
    utilisateur = f"u-{uuid.uuid4().hex}"
    async with ouvrir_memoire(str(URL)) as memoire:
        store = memoire.store
        assert isinstance(store, AsyncPostgresStore)
        await store.aput((utilisateur, "memoire"), "/AGENTS.md", {"content": FAIT}, ttl=0.01)  # 0,6 seconde
        await asyncio.sleep(1.5)
        await store.sweep_ttl()
        assert await store.aget((utilisateur, "memoire"), "/AGENTS.md") is None


async def test_oublier_ou_corriger_s_applique_aussi_aux_conversations_deja_commencees() -> None:
    """KAN-86 : la mémoire vient du Store à chaque run ; l'état du fil n'en garde aucune copie périmée."""
    store = store_avec_competences()
    store.put(("rh", "memoire"), "/AGENTS.md", {"content": FAIT, "encoding": "utf-8"})
    agent = _agent("rh", store, AIMessage(content="un"), AIMessage(content="deux"), AIMessage(content="trois"))
    fil = _fil("fil-long")

    await agent.ainvoke({"messages": [HumanMessage(content="Premier tour")]}, fil)
    store.put(("rh", "memoire"), "/AGENTS.md", {"content": "- Je préfère les montants en MAD.", "encoding": "utf-8"})
    await agent.ainvoke({"messages": [HumanMessage(content="Deuxième tour")]}, fil)  # corrigée dans le panneau
    store.delete(("rh", "memoire"), "/AGENTS.md")
    await agent.ainvoke({"messages": [HumanMessage(content="Troisième tour")]}, fil)  # oubliée dans le panneau

    vus = ["\n".join(str(m.content) for m in tour) for tour in agent.faux.vus]
    assert "chantier Atlas" in vus[0]
    assert "montants en MAD" in vus[1] and "chantier Atlas" not in vus[1]
    assert "montants en MAD" not in vus[2] and "chantier Atlas" not in vus[2]
