# LangGraph et LangChain ne publient pas de stubs complets : seules ces règles sont levées, pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Procédure d'analyse d'incident par retour dans le temps (KAN-42, doc LangGraph « Use time-travel »).

Rejouer ou bifurquer depuis un point de reprise ré-exécute les étapes suivantes, donc rappelle le modèle et les outils :
la procédure s'applique à des données synthétiques et à des outils de lecture
(``site/docs/exploitation/incident-agent.md``).
"""

from typing import Any

from doubles import INDICATEURS, appel, modele, outil
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import InMemorySaver

from staport_ia.agent import creer_agent


async def test_on_rejoue_puis_bifurque_depuis_le_point_de_reprise_avant_l_outil() -> None:
    periodes: list[str] = []

    def indicateurs(periode: str = "", **_: Any) -> dict[str, Any]:
        periodes.append(periode)
        return INDICATEURS

    faux = modele(
        appel("paie_indicateurs", "a1", periode="2026-09"),
        AIMessage(content="Masse : 1 250 000,50 MAD."),
        AIMessage(content="Rejeu : même réponse."),  # le rejeu rappelle le modèle après l'outil
        AIMessage(content="Bifurcation : réponse sur une autre période."),
    )
    agent = creer_agent(
        faux,
        [outil("paie_indicateurs", indicateurs)],  # pyright: ignore[reportArgumentType]
        checkpointer=InMemorySaver(),
    )
    config: RunnableConfig = {"configurable": {"thread_id": "incident-synthetique"}}
    await agent.ainvoke({"messages": [HumanMessage(content="Masse de septembre ?")], "pinned_skills": ["paie"]}, config)

    # 1. Inspecter : l'historique (du plus récent au plus ancien) donne chaque point de reprise et l'étape suivante.
    historique = [etat async for etat in agent.aget_state_history(config)]
    assert historique[0].next == ()  # le dernier point : plus rien à exécuter
    avant_outils = next(etat for etat in historique if "tools" in etat.next)

    # 2. Rejouer : seules les étapes à partir de ce point se ré-exécutent (l'outil, puis le modèle).
    rejeu = await agent.ainvoke(None, avant_outils.config)
    assert periodes == ["2026-09", "2026-09"]
    assert rejeu["messages"][-1].text == "Rejeu : même réponse."

    # 3. Bifurquer : corriger l'appel d'outil au point voulu (même identifiant de message : le réducteur le remplace),
    # puis reprendre ; l'historique d'origine reste intact (update_state crée une branche, ne revient pas en arrière).
    appel_d_origine = avant_outils.values["messages"][-1]
    corrige = AIMessage(
        id=appel_d_origine.id,
        content="",
        tool_calls=[{"id": "a1", "name": "paie_indicateurs", "args": {"periode": "2026-08"}}],
    )
    fourche = await agent.aupdate_state(avant_outils.config, {"messages": [corrige]})
    bifurcation = await agent.ainvoke(None, fourche)
    assert periodes[-1] == "2026-08"
    assert bifurcation["messages"][-1].text == "Bifurcation : réponse sur une autre période."
    apres = [etat async for etat in agent.aget_state_history(config)]
    assert len(apres) > len(historique)  # la bifurcation ajoute des points de reprise, rien n'est effacé
