# LangGraph et ses intégrations ne publient pas de stubs complets : seules ces règles sont levées.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Les trois mémoires de l'assistant et leur frontière (KAN-86, site/docs/ia/les-trois-memoires.md).

1. L'état du fil (checkpointer) : ce qui appartient à une conversation et disparaît avec elle.
2. La mémoire inter-fils (Store) : ce qui appartient à l'utilisateur et survit à ses conversations.
3. Le contexte d'exécution (``ContexteRun``) : immuable, fourni par le service, jamais écrit ni mémorisé.
"""

from typing import Any, get_type_hints

from doubles import INDICATEURS, modele, outil, store_avec_competences
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import InMemorySaver

from staport_ia.agent import ContexteRun, creer_agent
from staport_ia.memoire import espace_conversation

#: Ce que l'application met dans l'état du fil ; le reste (plan, résumé, accords…) vient des intergiciels officiels.
ETAT_DU_FIL_DE_L_APPLICATION = {"messages", "pinned_skills", "todos"}
#: Ce qui n'appartient jamais à l'état du fil : le contexte d'exécution et la mémoire inter-fils vivent ailleurs.
JAMAIS_DANS_LE_FIL = {"contexte_erp", "utilisateur", "jeton", "espace", "AGENTS.md"}


def _agent(store: Any, saver: InMemorySaver) -> Any:
    return creer_agent(
        modele(AIMessage(content="ok"), AIMessage(content="ok")),  # pyright: ignore[reportArgumentType]
        [outil("paie_indicateurs", INDICATEURS)],  # pyright: ignore[reportArgumentType]
        checkpointer=saver,
        utilisateur="rh",
        store=store,
    )


def test_le_schema_d_etat_du_fil_est_formalise_et_ne_contient_ni_contexte_ni_memoire_inter_fils() -> None:
    canaux = set(_agent(store_avec_competences(), InMemorySaver()).channels)

    assert ETAT_DU_FIL_DE_L_APPLICATION <= canaux
    assert not (JAMAIS_DANS_LE_FIL & canaux)


def test_le_contexte_d_execution_est_un_schema_a_part_en_lecture_seule_pour_le_modele() -> None:
    assert set(get_type_hints(ContexteRun)) == {"contexte_erp"}


async def test_supprimer_une_conversation_ne_touche_ni_la_memoire_ni_l_espace_de_l_utilisateur() -> None:
    store = store_avec_competences()
    store.put(("rh", "memoire"), "/AGENTS.md", {"content": "- Je suis responsable du chantier Atlas."})
    store.put(("rh", "espace"), "/rapport.md", {"content": "Rapport."})
    saver = InMemorySaver()
    fil = espace_conversation("rh", "t1")
    await _agent(store, saver).ainvoke(
        {"messages": [HumanMessage(content="Bonjour")]}, {"configurable": {"thread_id": fil}}
    )

    await saver.adelete_thread(fil)  # ce que fait « supprimer la conversation » (KAN-81)

    assert store.get(("rh", "memoire"), "/AGENTS.md") is not None
    assert store.get(("rh", "espace"), "/rapport.md") is not None


async def test_oublier_la_memoire_ne_touche_pas_l_historique_des_conversations() -> None:
    store = store_avec_competences()
    store.put(("rh", "memoire"), "/AGENTS.md", {"content": "- Je suis responsable du chantier Atlas."})
    saver = InMemorySaver()
    config: Any = {"configurable": {"thread_id": espace_conversation("rh", "t1")}}
    agent = _agent(store, saver)
    await agent.ainvoke({"messages": [HumanMessage(content="Bonjour")]}, config)

    store.delete(("rh", "memoire"), "/AGENTS.md")  # ce que fait « tout oublier » (KAN-84)

    historique = (await agent.aget_state(config)).values["messages"]
    assert [m.content for m in historique] == ["Bonjour", "ok"]
