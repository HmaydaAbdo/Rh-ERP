# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Agent de Staport Intelligence dans ERP-RH : ``create_agent`` de LangChain et ses middlewares officiels.

Rien n'est orchestré à la main : le modèle choisit lui-même la forme de sa réponse — directe pour un message simple,
avec outils pour une question de données, avec un plan suivi (``write_todos``) pour une demande à plusieurs étapes.
Les middlewares officiels bornent la boucle (appels de modèle et d'outils), choisissent les outils utiles et
injectent l'outil d'interface composée ``generate_a2ui`` quand le runtime CopilotKit l'active
(``CopilotKitMiddleware``).

L'exactitude des chiffres repose sur les outils de l'ERP : ils calculent eux-mêmes totaux, écarts, pourcentages,
moyennes et rangs (décision du propriétaire du 2026-10-27, docs/ia.md § 4) ; le modèle ne fait que les reprendre.
Aucun contrôle après coup : le vérificateur de chiffres a été supprimé.
"""

import json
from collections.abc import Sequence
from importlib import resources
from typing import Any, cast

from ag_ui_a2ui_toolkit import DEFAULT_DESIGN_GUIDELINES
from copilotkit import CopilotKitMiddleware
from langchain.agents import create_agent
from langchain.agents.middleware import (
    AgentMiddleware,
    LLMToolSelectorMiddleware,
    ModelCallLimitMiddleware,
    SummarizationMiddleware,
    TodoListMiddleware,
    ToolCallLimitMiddleware,
    dynamic_prompt,
)
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph

from erp_rh_ia.contexte import ContexteErp
from erp_rh_ia.surfaces import SurfacesResultats

SYSTEME = """Tu es Staport Intelligence, l'assistant numérique de Staport. Tu réponds en français.
Tu aides l'utilisateur à travers les capacités métier disponibles pour son compte dans les applications de Staport.
Le catalogue de capacités fourni avec cette requête indique ce que tu peux réellement faire maintenant. Il est construit
à partir des outils autorisés par les applications connectées ; ne prétends jamais couvrir un domaine ou une application
qui n'y apparaît pas. Les applications et domaines peuvent être raccordés progressivement. Seul le raccordement approuvé
d'une application peut ajouter des capacités : une conversation ne crée jamais un outil ni un droit.
Choisis la forme de ta réponse :
- message simple (salutation, remerciement) : réponds directement, en une ou deux phrases, sans outil ;
- question sur tes capacités : réponds directement à partir du catalogue de cette requête, avec des exemples concrets
  et sans nommer les outils techniques ;
- question sur les données des applications connectées : appelle les outils utiles, puis réponds brièvement ;
- demande d'une donnée absente des outils ERP, d'une prévision, de la météo ou d'un fait extérieur : ne réponds pas
  depuis tes connaissances générales ; dis clairement que l'information n'est pas disponible par les capacités
  actuellement connectées ;
- demande à plusieurs étapes : établis d'abord un plan avec `write_todos`, puis suis-le.
Quand plusieurs outils sont indépendants (deux mois à comparer, plusieurs chantiers), appelle-les **en même temps**,
dans un seul tour : chaque aller-retour avec le modèle coûte du temps à l'utilisateur.
Règles impératives :
1. Toute valeur (effectif, montant, date, nombre, nom, code) vient d'un outil ou de la conversation en cours (un
   résultat d'outil déjà lu, une réponse de l'utilisateur). N'invente jamais.
2. Ne calcule rien : ni somme, ni différence, ni moyenne, ni pourcentage, ni rang. Utilise l'outil du domaine concerné
   qui fournit l'indicateur, la comparaison ou le classement demandé. Reprends les valeurs telles que les outils les
   donnent, avec leur période. Si aucun outil ne donne la valeur demandée, dis-le au lieu de la calculer.
3. Si les outils connectés ne donnent pas l'information, dis-le simplement.
4. Si un outil répond « Access Denied » ou « Accès refusé », dis à l'utilisateur qu'il n'a pas ce droit ; ne contourne
   pas le refus et ne le retente pas. L'outil `systeme_identite` indique les droits de l'utilisateur.
5. Pour une entité citée par son nom ou son code, utilise d'abord l'outil de recherche du référentiel correspondant,
   lorsque le contrat de l'outil métier demande un identifiant.
5a. Respecte exactement le type JSON du schéma MCP : un identifiant déclaré entier reste un nombre JSON sans guillemets
    (par exemple `123`), jamais une chaîne (`"123"`). Ne transforme pas un identifiant numérique reçu d'un outil.
6. Respecte le sens, le format et les valeurs par défaut définis par le contexte et les descriptions des outils. Une
   période, un identifiant et un code métier sont des valeurs distinctes ; respecte le type et le format du schéma de
   chaque outil.
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
11. Utilise les filtres, critères de tri et la pagination documentés par l'outil. Pour un classement, demande les
    critères au service métier au lieu de charger une liste complète ou de trier toi-même.
12. Une conversation se poursuit : appuie-toi sur les échanges précédents (valeurs déjà lues, choix de l'utilisateur),
    analyse, pose une question si la demande est ambiguë, et relis la valeur avec l'outil avant de l'affirmer quand elle
    a pu changer ou que tu as un doute."""

#: Règles de l'ERP pour le sous-agent qui compose les surfaces, ajoutées aux consignes de conception officielles.
CONSIGNES_SURFACE = """Règles impératives d'ERP-RH :
- Tous les textes sont en français.
- Chaque valeur affichée (montant, effectif, nombre, période) est reprise telle quelle d'un résultat d'outil de la
  conversation, avec son unité : MAD pour les montants. Ne calcule rien : ni total, ni moyenne, ni écart, ni
  pourcentage. Une valeur absente des outils n'apparaît pas.
- Utilise uniquement les composants du catalogue fourni : KpiGrid pour des indicateurs, Chart pour un graphique,
  DataTable pour un tableau (lignes données en littéral dans « rows »), Text, Row, Column et Card pour la mise en page.
- Surface sobre : un titre court, puis les valeurs, sans phrase d'introduction ni conclusion."""

# Un résultat d'outil est plafonné à 12 000 caractères (environ 4 000 jetons) et un run enchaîne jusqu'à 6 appels : sous
# ce seuil, un run de plusieurs outils ne déclenche jamais le résumé. Mesuré le 2026-10-27 : à 12 000 jetons, le résumé
# remplaçait en cours de réponse les chiffres tout juste lus par un texte tronqué, puis l'agent devinait des montants.
SEUIL_RESUME_JETONS = 40_000

# Le middleware officiel reçoit les descriptions et schémas du catalogue MCP de l'utilisateur à chaque requête.
_PROMPT_SELECTION_OUTILS = """Sélectionne tous les outils nécessaires pour répondre à la question.
- Ne sélectionne que les noms présents dans le schéma structuré fourni : certains outils sont inclus automatiquement
  dans l'appel du modèle principal et n'appartiennent donc pas à ta liste de sélection.
- Utilise les descriptions et schémas des outils pour trouver le domaine propriétaire de la demande et son outil métier.
- Si un nom ou un code doit être résolu avant l'analyse, sélectionne aussi l'outil de recherche de référentiel adapté.
- Pour une question sur les données métier, sélectionne tous les outils pertinents nécessaires ; ne réponds pas qu'aucun
  outil n'est disponible sans avoir vérifié le catalogue fourni.
- N'ajoute pas d'outil sans rapport avec la question.
- Pour une salutation, une question sur les capacités (déjà décrites dans le contexte dynamique), une demande hors
  entreprise ou une information que les outils ne peuvent pas établir, une liste vide est appropriée."""


def _capacites_dynamiques(outils: Sequence[BaseTool]) -> Any:
    """Middleware officiel LangChain : décrit les capacités MCP obtenues pour l'utilisateur de ce run."""

    descriptions = sorted(
        {
            outil.description.strip()
            for outil in outils
            if outil.name != "systeme_identite" and outil.description and outil.description.strip()
        }
    )
    catalogue = "\n".join(f"- {description}" for description in descriptions)

    @dynamic_prompt
    def prompt_capacites(request: Any) -> str:
        base = request.system_message.text if request.system_message else SYSTEME
        if not catalogue:
            return f"{base}\n\nCapacités métier actuellement accessibles : aucune capacité MCP n'est disponible."
        return (
            f"{base}\n\nCapacités métier accessibles à cet utilisateur, issues du catalogue MCP autorisé :\n"
            f"{catalogue}\n"
            "Pour répondre à une question sur tes capacités, résume cette liste en langage clair. "
            "Cette liste décrit seulement les outils de ce run ; elle n'est pas une promesse de couverture globale."
        )

    return prompt_capacites


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
    intergiciels: list[AgentMiddleware[Any, Any]] = [
        CopilotKitMiddleware(a2ui_params=_parametres_a2ui()),  # pyright: ignore[reportArgumentType]
        SurfacesResultats(),
        ContexteErp(outils),
        TodoListMiddleware(),
        ModelCallLimitMiddleware(run_limit=appels_modele, exit_behavior="end"),
        ToolCallLimitMiddleware(run_limit=appels_outils),
    ]
    if resumeur is not None:
        # Conversation durable : au-delà de SEUIL_RESUME_JETONS, le début est résumé ; les 12 derniers messages restent.
        intergiciels.insert(
            2,
            SummarizationMiddleware(model=resumeur, trigger=("tokens", SEUIL_RESUME_JETONS), keep=("messages", 12)),
        )
    if selecteur is not None:
        # Le middleware officiel sélectionne, sans plafond fixe, les outils pertinents du catalogue MCP autorisé.
        intergiciels.insert(
            2,
            LLMToolSelectorMiddleware(
                model=selecteur,
                system_prompt=_PROMPT_SELECTION_OUTILS,
                # Comportement officiel du middleware : après l'essai de reprise, une réponse mal formée rend
                # tous les outils disponibles à l'agent au lieu d'échouer avant l'appel métier.
                on_parsing_failure="all",
            ),
        )
    return create_agent(
        model=modele,
        tools=list(outils),
        system_prompt=SYSTEME,
        middleware=[*intergiciels, _capacites_dynamiques(outils)],
        checkpointer=checkpointer,
        name="staport-intelligence",
    )
