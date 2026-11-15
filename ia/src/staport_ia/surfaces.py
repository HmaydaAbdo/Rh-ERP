# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Surfaces A2UI des résultats d'outils (site/docs/ia, T16 et KAN-80).

Motif officiel « schéma fixe » de CopilotKit : c'est l'outil MCP de l'ERP qui décrit sa surface (colonnes d'un
tableau, courbe), à côté du code qui construit ses lignes, et qui la rend avec son résultat sous la clé
``a2ui_operations`` (``api/src/staport/domains/mcp/surfaces.py``). Un tableau de 50 lignes recopié par le modèle coûte
des milliers de jetons et un risque d'erreur de recopie : ici le service ne compose rien, il transmet.

Deux crochets officiels des middlewares de LangChain : ``wrap_tool_call`` met le résultat sous l'enveloppe que le
runtime CopilotKit détecte pour afficher la surface, et ``wrap_model_call`` ne montre au modèle que le résultat
d'origine, sans les opérations, qu'il se contente de commenter.
"""

import json
from collections.abc import Awaitable, Callable
from typing import Any, cast

from copilotkit import a2ui
from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain.agents.middleware.types import ToolCallRequest
from langchain_core.messages import AnyMessage, ToolMessage
from langgraph.types import Command

#: Outil d'interface composée de CopilotKit : sa surface est composée par le modèle, jamais présentée deux fois.
OUTIL_A2UI = "generate_a2ui"


class SurfacesResultats(AgentMiddleware[Any, Any]):
    """Transmet la surface que l'outil a décrite ; le modèle ne voit que le résultat d'origine."""

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        resultat = await handler(request)
        if not isinstance(resultat, ToolMessage) or resultat.name == OUTIL_A2UI:
            return resultat
        artefact = resultat.artifact
        donnees = cast(dict[str, Any], artefact).get("structured_content") if isinstance(artefact, dict) else None
        if not isinstance(donnees, dict) or not isinstance(donnees.get(a2ui.A2UI_OPERATIONS_KEY), list):
            return resultat
        operations = cast(list[dict[str, Any]], donnees[a2ui.A2UI_OPERATIONS_KEY])
        d_origine = {
            cle: valeur for cle, valeur in cast(dict[str, Any], donnees).items() if cle != a2ui.A2UI_OPERATIONS_KEY
        }
        enveloppe = {a2ui.A2UI_OPERATIONS_KEY: operations, "resultat": json.dumps(d_origine, ensure_ascii=False)}
        return resultat.model_copy(update={"content": json.dumps(enveloppe, ensure_ascii=False)})

    async def awrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], Awaitable[ModelResponse[Any]]],
    ) -> ModelResponse[Any]:
        messages = [_sans_surface(message) for message in request.messages]
        return await handler(request.override(messages=messages))


def resultat_sans_surface(contenu: Any) -> Any:
    """Le résultat d'origine d'un contenu d'outil présenté ; tout autre contenu est rendu tel quel."""
    if not isinstance(contenu, str) or not contenu.startswith('{"' + a2ui.A2UI_OPERATIONS_KEY):
        return contenu
    try:
        enveloppe = json.loads(contenu)
    except ValueError:
        return contenu
    return enveloppe.get("resultat", contenu) if isinstance(enveloppe, dict) else contenu


def _sans_surface(message: AnyMessage) -> AnyMessage:
    if not isinstance(message, ToolMessage):
        return message
    resultat = resultat_sans_surface(message.content)
    if resultat is message.content:
        return message
    return message.model_copy(update={"content": resultat})
