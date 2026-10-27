# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Agent de l'assistant RH (docs/ia.md, T10) : la boucle officielle ``create_agent`` de LangChain et ses middlewares.

Rien n'est orchestré à la main : le modèle choisit lui-même la forme de sa réponse — directe pour un message simple,
avec outils pour une question de données, avec un plan suivi (``write_todos``) pour une demande à plusieurs étapes.
Les middlewares officiels bornent la boucle (appels de modèle et d'outils), choisissent les outils utiles et
injectent l'outil d'interface composée ``generate_a2ui`` quand le runtime CopilotKit l'active
(``CopilotKitMiddleware``).

Seule règle à nous, parce qu'aucun framework ne la fournit : le **vérificateur de chiffres** de l'ERP, placé dans le
point d'extension officiel ``after_model``. Le texte et la surface A2UI partent en flux vers l'interface ; si un nombre
de la réponse ou de la dernière surface ne vient pas des outils de l'ERP du run, la réponse est retirée et réécrite une
fois, puis remplacée par une abstention. L'état ``verification``
(``en_cours`` puis ``verifiee`` ou ``abstention``) est partagé avec l'interface.
"""

import json
from collections.abc import Awaitable, Callable, Sequence
from importlib import resources
from typing import Annotated, Any, Literal, NotRequired, cast

from ag_ui_a2ui_toolkit import DEFAULT_DESIGN_GUIDELINES
from copilotkit import CopilotKitMiddleware
from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentMiddleware,
    AgentState,
    LLMToolSelectorMiddleware,
    ModelCallLimitMiddleware,
    ModelRequest,
    ModelResponse,
    SummarizationMiddleware,
    TodoListMiddleware,
    ToolCallLimitMiddleware,
)
from langchain.agents.middleware.types import PrivateStateAttr, hook_config
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, RemoveMessage, ToolMessage
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.runtime import Runtime

from erp_rh_ia.contexte import ContexteErp
from erp_rh_ia.surfaces import PresentationResultats, avec_surfaces, resultat_sans_surface
from erp_rh_ia.verification import valeurs_surface, verifier

SYSTEME = """Tu es l'assistant RH d'ERP-RH, l'ERP d'une entreprise du BTP au Maroc. Tu réponds en français.
Choisis la forme de ta réponse :
- message simple (salutation, remerciement, question sur ce que tu sais faire) : réponds directement, en une ou deux
  phrases, sans outil ;
- question sur les données de l'ERP : appelle les outils utiles, puis réponds brièvement ;
- demande à plusieurs étapes : établis d'abord un plan avec `write_todos`, puis suis-le.
Quand plusieurs outils sont indépendants (deux mois à comparer, plusieurs chantiers), appelle-les **en même temps**,
dans un seul tour : chaque aller-retour avec le modèle coûte du temps à l'utilisateur.
Règles impératives :
1. Toute valeur (effectif, montant, date, nombre, nom, code) vient d'un outil. N'invente jamais.
2. Ne calcule rien : ni somme, ni différence, ni moyenne, ni pourcentage. Reprends les valeurs telles que les outils
   les donnent, avec leur période.
3. Si les outils ne donnent pas l'information, dis-le simplement.
4. Si un outil répond « Access Denied » ou « Accès refusé », dis à l'utilisateur qu'il n'a pas ce droit ; ne contourne
   pas le refus et ne le retente pas. L'outil `systeme_identite` indique les droits de l'utilisateur.
5. Pour un chantier, une équipe ou une fonction cité par son nom ou son code, cherche d'abord son identifiant avec
   l'outil de recherche du référentiel, puis utilise cet identifiant.
6. Une valeur de la forme AAAA-MM (par exemple 2026-09) est une période de paie : passe-la telle quelle en paramètre
   « periode ». Ce n'est jamais un code de chantier, d'équipe ou de fonction. Sans période dans la question, le contexte
   du moment donne le dernier mois de paie importé : c'est le mois par défaut, sans appel d'outil pour le chercher.
7. Nomme chaque chiffre selon la définition que donne l'outil (champ « definitions » s'il existe). Si la question
   emploie un mot ambigu (entrées, sorties, effectif), dis le sens retenu et donne aussi les valeurs voisines que
   l'outil fournit, par exemple l'effectif du mois précédent et l'écart net à côté des entrées.
8. Une liste rendue par un outil (quatre lignes ou plus) s'affiche d'elle-même à l'écran en tableau, avec une courbe
   pour une suite de mois : ne la recopie pas. Réponds en deux ou trois phrases qui citent les valeurs remarquables
   telles que l'outil les donne. Pour des indicateurs ou un graphique qui ne viennent pas d'une liste, appelle
   `generate_a2ui` après avoir obtenu les données, puis résume en une ou deux phrases. La surface ne reprend que des
   valeurs des outils.
9. Les montants sont en dirhams (MAD).
10. Si la demande est ambiguë et que le choix change le résultat (période, périmètre, critère de classement, sens
    d'un mot), et que l'outil `poser_question` est disponible, pose une question à l'utilisateur avec 2 à 5 options
    plutôt que de deviner, puis poursuis avec sa réponse. Une seule question à la fois ; jamais pour une valeur que
    les outils donnent, ni pour une salutation.
11. Tu disposes d'outils de tri et de pagination (`tri`, `sens`, `page`, `limite`) : compose-les toi-même pour répondre
    à « les cinq plus gros salaires », « le chantier le moins cher », « les derniers embauchés », au lieu de lire toute
    une liste."""

ABSTENTION = (
    "Je ne peux pas répondre de façon fiable avec les données disponibles : ne vous fiez pas aux chiffres affichés "
    "ci-dessus. Ouvrez l'écran correspondant de l'ERP pour vérifier."
)
#: Outil d'interface composée injecté par ``CopilotKitMiddleware`` : son résultat est une surface à vérifier, jamais
#: une source de chiffres.
OUTIL_A2UI = "generate_a2ui"
REECRITURE = (
    "Ta réponse précédente contenait des nombres absents des résultats des outils : {inconnus}. Réécris-la en ne "
    "reprenant que des valeurs des outils, sans aucun calcul."
)

#: Règles de l'ERP pour le sous-agent qui compose les surfaces, ajoutées aux consignes de conception officielles.
CONSIGNES_SURFACE = """Règles impératives d'ERP-RH :
- Tous les textes sont en français.
- Chaque valeur affichée (montant, effectif, nombre, période) est reprise telle quelle d'un résultat d'outil de la
  conversation, avec son unité : MAD pour les montants. Ne calcule rien : ni total, ni moyenne, ni écart, ni
  pourcentage. Une valeur absente des outils n'apparaît pas.
- Utilise uniquement les composants du catalogue fourni : KpiGrid pour des indicateurs, Chart pour un graphique,
  DataTable pour un tableau (lignes données en littéral dans « rows »), Text, Row, Column et Card pour la mise en page.
- Surface sobre : un titre court, puis les valeurs, sans phrase d'introduction ni conclusion."""

Verification = Literal["en_cours", "verifiee", "abstention"]


def _parametres_a2ui() -> dict[str, Any]:
    """Paramètres officiels de l'outil ``generate_a2ui`` : le catalogue de base A2UI v0.9 (fichier de la spécification,
    copié de ``@a2ui/web_core`` 0.10.4, celui que rend CopilotKit Angular) complété des composants de l'ERP
    (``catalogue_a2ui_erp.json``) pour valider chaque surface et la faire reprendre par le sous-agent tant qu'elle n'est
    pas conforme, et les consignes de l'ERP."""
    paquet = resources.files("erp_rh_ia")
    catalogue = json.loads(paquet.joinpath("catalogue_a2ui_base.json").read_text(encoding="utf-8"))
    erp = json.loads(paquet.joinpath("catalogue_a2ui_erp.json").read_text(encoding="utf-8"))
    composants = {**catalogue["components"], **erp["components"]}
    return {
        "catalog": {"components": composants},
        "guidelines": {
            "design_guidelines": f"{DEFAULT_DESIGN_GUIDELINES}\n{CONSIGNES_SURFACE}",
            "composition_guide": _guide_composition(composants),
        },
    }


#: Composants de présentation proposés au sous-agent : les surfaces de l'ERP sont en lecture seule.
_COMPOSANTS_SURFACE = (
    *("KpiGrid", "Chart", "DataTable"),
    *("Text", "Row", "Column", "List", "Card", "Divider", "Icon", "Tabs"),
)


def _guide_composition(composants: dict[str, Any]) -> str:
    """Le guide de composition du sous-agent, lu dans le catalogue : chaque composant de présentation, ses propriétés
    (requises marquées) et leurs valeurs admises ; quelques centaines de jetons au lieu du schéma complet."""
    lignes = ["## Composants disponibles (catalogue de base A2UI v0.9 et composants de l'ERP)"]
    for nom in _COMPOSANTS_SURFACE:
        schema: dict[str, Any] = composants[nom]
        proprietes: dict[str, Any] = {}
        requises: set[str] = set()
        for partie in [schema, *schema.get("allOf", [])]:
            proprietes.update(partie.get("properties", {}))
            requises.update(partie.get("required", []))
        details: list[str] = []
        for cle, definition in proprietes.items():
            if cle == "component":
                continue
            valeurs = cast(list[str], definition.get("enum", [])) if isinstance(definition, dict) else []
            articles = cast(dict[str, Any], definition.get("items", {})) if isinstance(definition, dict) else {}
            elements = cast(dict[str, Any], articles.get("properties", {}))
            libelle = f"{cle} (requis)" if cle in requises else cle
            if elements:
                libelle = f"{libelle} [{', '.join(elements)}]"
            details.append(f"{libelle} : {', '.join(valeurs)}" if valeurs else libelle)
        description = f" — {schema['description']}" if "description" in schema else ""
        lignes.append(f"- {nom}{description} : {' ; '.join(details)}")
    return "\n".join(lignes)


class EtatVerification(AgentState[Any]):
    """État du vérificateur : ``verification`` est partagé avec l'interface, le reste est privé au serveur."""

    verification: NotRequired[Verification]
    chiffres_inconnus: NotRequired[Annotated[list[str], PrivateStateAttr]]
    reecritures: NotRequired[Annotated[int, PrivateStateAttr]]


class VerificateurChiffres(AgentMiddleware[EtatVerification, Any]):
    """Règle métier de l'ERP (docs/ia.md, § 4) : chaque nombre d'une réponse finale vient des outils du même tour."""

    state_schema = EtatVerification

    def __init__(self, reecritures: int = 1) -> None:
        super().__init__()
        self._reecritures = reecritures

    async def abefore_agent(self, state: EtatVerification, runtime: Runtime[Any]) -> dict[str, Any] | None:
        return {"verification": "en_cours", "chiffres_inconnus": [], "reecritures": 0}

    async def awrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], Awaitable[ModelResponse[Any]]],
    ) -> ModelResponse[Any]:
        inconnus: list[str] = request.state.get("chiffres_inconnus") or []
        if not inconnus:
            return await handler(request)
        # La consigne de réécriture ne vaut que pour cet appel : elle n'entre pas dans la conversation visible.
        consigne = HumanMessage(content=REECRITURE.format(inconnus=", ".join(inconnus)))
        return await handler(request.override(messages=[*request.messages, consigne]))

    @hook_config(can_jump_to=["model"])
    async def aafter_model(self, state: EtatVerification, runtime: Runtime[Any]) -> dict[str, Any] | None:
        reponse = state["messages"][-1]
        if not isinstance(reponse, AIMessage) or reponse.tool_calls:
            return None  # pas encore la réponse finale
        question, sources, surface = _tour(state["messages"])
        verification = verifier(f"{reponse.text}\n{surface}", sources, question)
        if verification.conforme:
            return {"verification": "verifiee", "chiffres_inconnus": []}
        if state.get("reecritures", 0) < self._reecritures:
            return {
                "messages": [RemoveMessage(id=reponse.id or "")],
                "chiffres_inconnus": list(verification.nombres_inconnus),
                "reecritures": state.get("reecritures", 0) + 1,
                "jump_to": "model",
            }
        return {
            "messages": [AIMessage(id=reponse.id, content=ABSTENTION)],
            "verification": "abstention",
            "chiffres_inconnus": [],
        }


def creer_agent(
    modele: BaseChatModel,
    outils: Sequence[BaseTool],
    *,
    selecteur: BaseChatModel | None = None,
    resumeur: BaseChatModel | None = None,
    checkpointer: BaseCheckpointSaver[Any] | None = None,
    appels_modele: int = 8,
    appels_outils: int = 8,
) -> CompiledStateGraph[Any, Any, Any, Any]:
    """L'agent d'un run ; ``selecteur`` (petit modèle) ne transmet au modèle que les outils utiles à la question et
    ``resumeur`` résume le début d'une conversation devenue longue (``SummarizationMiddleware``)."""
    outils = avec_surfaces(outils)
    intergiciels: list[AgentMiddleware[Any, Any]] = [
        CopilotKitMiddleware(a2ui_params=_parametres_a2ui()),  # pyright: ignore[reportArgumentType]
        PresentationResultats(),
        ContexteErp(outils),
        TodoListMiddleware(),
        ModelCallLimitMiddleware(run_limit=appels_modele, exit_behavior="end"),
        ToolCallLimitMiddleware(run_limit=appels_outils),
        VerificateurChiffres(),
    ]
    if resumeur is not None:
        # Conversation durable : au-delà de 12 000 jetons, le début est résumé, les 8 derniers messages restent intacts.
        intergiciels.insert(
            2, SummarizationMiddleware(model=resumeur, trigger=("tokens", 12_000), keep=("messages", 8))
        )
    if selecteur is not None:
        intergiciels.insert(2, LLMToolSelectorMiddleware(model=selecteur, max_tools=6, always_include=["write_todos"]))
    return create_agent(
        model=modele,
        tools=list(outils),
        system_prompt=SYSTEME,
        middleware=intergiciels,
        checkpointer=checkpointer,
        name="erp-rh",
    )


def _tour(messages: Sequence[AnyMessage]) -> tuple[str, list[Any], str]:
    """La dernière question, les résultats des outils de l'ERP reçus depuis (seules sources admises pour les nombres) et
    la dernière surface A2UI du tour, à vérifier comme la réponse."""
    question = ""
    sources: list[Any] = []
    surface = ""
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            question = message.text
            break
        if not isinstance(message, ToolMessage):
            continue
        if message.name == OUTIL_A2UI:
            surface = surface or valeurs_surface(message.text)
            continue
        sources.append(resultat_sans_surface(message.content))
        if message.artifact is not None:
            sources.append(message.artifact)
    return question, sources, surface
