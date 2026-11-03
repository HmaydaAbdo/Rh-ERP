"""Garde de sortie de l'agent (docs/ia.md, § 4 ; épopée KAN-205) : un contrôle déterministe de la réponse finale,
hors modèle. Une règle de prompt demande au modèle de se retenir, elle ne l'y oblige pas (conventions/lecons.md).

Méthode documentée par LangChain (« After agent guardrails ») : un ``after_agent`` remplace la dernière réponse qui
reproduit les consignes du système ou nomme un outil technique. Le texte est déjà émis en flux au moment du contrôle :
la garde protège l'historique conservé et les sorties non diffusées (évaluation, reprise de conversation).
"""

from collections.abc import Iterable
from typing import Any

from langchain.agents.middleware import AgentMiddleware, AgentState, after_agent
from langchain_core.messages import AIMessage
from langgraph.runtime import Runtime

from erp_rh_ia.criteres import OUTILS_HARNAIS, fuite_systeme, noms_techniques, sans_accents

REPONSE_REMPLACEMENT = "Je ne peux pas répondre ainsi. Posez-moi une question sur vos données RH."


def motifs(reponse: str, noms_outils: Iterable[str]) -> list[str]:
    """Pourquoi la réponse ne peut pas partir telle quelle (vide si elle est acceptable)."""
    noms = set(noms_outils) | OUTILS_HARNAIS | {"systeme_identite", "generate_a2ui"}
    return [*fuite_systeme(sans_accents(reponse)), *noms_techniques(reponse, sorted(noms))]


def garde_sortie(noms_outils: Iterable[str]) -> AgentMiddleware[Any, Any]:
    noms = tuple(noms_outils)

    @after_agent
    def controler(state: AgentState[Any], runtime: Runtime[Any]) -> dict[str, Any] | None:
        dernier = state["messages"][-1] if state["messages"] else None
        if not isinstance(dernier, AIMessage) or dernier.tool_calls or not motifs(dernier.text, noms):
            return None
        return {"messages": [AIMessage(content=REPONSE_REMPLACEMENT, id=dernier.id)]}

    return controler
