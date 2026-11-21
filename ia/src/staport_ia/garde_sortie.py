"""Garde de sortie de l'agent (site/docs/ia, § 4 ; épopée KAN-205) : un contrôle déterministe de la réponse finale,
hors modèle. Une règle de prompt demande au modèle de se retenir, elle ne l'y oblige pas (conventions/lecons.md).

Méthode documentée par LangChain (« After agent guardrails ») : un ``after_agent`` remplace la dernière réponse qui
reproduit les consignes du système ou nomme un outil technique. Le texte est déjà émis en flux au moment du contrôle :
la garde protège l'historique conservé et les sorties non diffusées (évaluation, reprise de conversation).
"""

import re
from collections.abc import Iterable, Sequence
from typing import Any

from langchain.agents.middleware import AgentMiddleware, AgentState, after_agent
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, ToolMessage
from langgraph.runtime import Runtime

from staport_ia.criteres import OUTILS_HARNAIS, fuite_systeme, noms_techniques, sans_accents

REPONSE_REMPLACEMENT = "Je ne peux pas répondre ainsi. Posez-moi une question sur vos données RH."

#: KAN-305 : réponse donnée quand l'agent affirme avoir réglé un filtre sans que l'outil de page l'ait fait.
REPONSE_FILTRE_NON_REGLE = (
    "Je n'ai pas modifié les filtres de la page : je ne peux le faire que depuis la page ouverte. "
    "Je peux en revanche vous donner ici les chiffres pour la période et le périmètre voulus."
)

#: Suffixe des outils de page qui règlent les filtres (``paie_regler_filtres``, …), enregistrés par le navigateur.
SUFFIXE_OUTIL_FILTRES = "_regler_filtres"

_DEMANDE_DE_FILTRE = re.compile(r"\bfiltr\w*|\bregle\w* (?:les |le |la )?(?:filtre|page)")
_AFFIRMATION_DE_FILTRE = re.compile(
    r"\b(?:est|sont|a ete|ont ete|etait|etaient)\s+(?:maintenant |bien |desormais |deja )?"
    r"(?:filtre|regle|applique|mis a jour)\w*"
    r"|\b(?:j'ai|ai|avons|je viens de)\s+(?:bien |deja )?(?:filtre|regle|applique|mis a jour)\w*"
    r"|\bfiltres?\s+(?:ont ete |sont |a ete )?(?:regle|applique|mis)\w*"
)


def affirme_un_filtre_non_regle(question: str, reponse: str, outils_reussis: Iterable[str]) -> bool:
    """Vrai si la réponse dit qu'un filtre est réglé alors que l'utilisateur en demandait un et qu'aucun outil de page
    n'a réussi dans ce tour. Une réponse qui décrit des chiffres filtrés (sans demande de filtre) n'est pas visée."""
    if any(nom.endswith(SUFFIXE_OUTIL_FILTRES) for nom in outils_reussis):
        return False
    return bool(
        _DEMANDE_DE_FILTRE.search(sans_accents(question)) and _AFFIRMATION_DE_FILTRE.search(sans_accents(reponse))
    )


def _tour(messages: Sequence[AnyMessage]) -> tuple[str, list[str]]:
    """La dernière question de l'utilisateur et les outils réussis depuis (le tour en cours)."""
    depuis = max((i for i, m in enumerate(messages) if isinstance(m, HumanMessage)), default=-1)
    question = messages[depuis].text if depuis >= 0 else ""
    reussis = [m.name or "" for m in messages[depuis + 1 :] if isinstance(m, ToolMessage) and m.status != "error"]
    return question, reussis


def motifs(reponse: str, noms_outils: Iterable[str]) -> list[str]:
    """Pourquoi la réponse ne peut pas partir telle quelle (vide si elle est acceptable)."""
    noms = set(noms_outils) | OUTILS_HARNAIS | {"systeme_identite", "generate_a2ui"}
    return [*fuite_systeme(sans_accents(reponse)), *noms_techniques(reponse, sorted(noms))]


def garde_sortie(noms_outils: Iterable[str]) -> AgentMiddleware[Any, Any]:
    noms = tuple(noms_outils)

    @after_agent
    def controler(state: AgentState[Any], runtime: Runtime[Any]) -> dict[str, Any] | None:
        dernier = state["messages"][-1] if state["messages"] else None
        if not isinstance(dernier, AIMessage) or dernier.tool_calls:
            return None
        if motifs(dernier.text, noms):
            return {"messages": [AIMessage(content=REPONSE_REMPLACEMENT, id=dernier.id)]}
        question, reussis = _tour(state["messages"])
        if affirme_un_filtre_non_regle(question, dernier.text, reussis):
            return {"messages": [AIMessage(content=REPONSE_FILTRE_NON_REGLE, id=dernier.id)]}
        return None

    return controler
