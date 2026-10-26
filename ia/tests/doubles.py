# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Doubles partagés des tests : le faux modèle de chat de LangChain et de vrais outils LangChain, sans réseau."""

import json
from collections.abc import AsyncIterator, Callable, Sequence
from typing import Any, cast

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGenerationChunk
from langchain_core.tools import BaseTool, StructuredTool
from pydantic import Field

INDICATEURS = {
    "periode": "2026-09",
    "indicateurs": {"masse": 1250000.5, "effectif": 412},
    "vue": {"module": "paie", "vue": "analytique", "parametres": {"periode": "2026-09"}},
}


class ModeleScripte(FakeMessagesListChatModel):
    """Rejoue des réponses dans l'ordre ; ``bind_tools`` (exigé par ``create_agent``) garde la trace des outils liés."""

    vus: list[list[BaseMessage]] = Field(default_factory=lambda: list[list[BaseMessage]]())
    outils_lies: list[list[str]] = Field(default_factory=lambda: list[list[str]]())

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> "ModeleScripte":
        self.outils_lies.append([_nom(t) for t in tools])
        return self

    def _generate(self, messages: list[BaseMessage], *args: Any, **kwargs: Any) -> Any:
        self.vus.append(list(messages))
        return super()._generate(messages, *args, **kwargs)

    async def _astream(
        self, messages: list[BaseMessage], *args: Any, **kwargs: Any
    ) -> AsyncIterator[ChatGenerationChunk]:
        """Comme un vrai modèle en flux (ChatLiteLLM) : texte, raisonnement et appels d'outils en morceaux."""
        resultat = self._generate(messages, *args, **kwargs)
        message = resultat.generations[0].message
        assert isinstance(message, AIMessage)
        yield ChatGenerationChunk(
            message=AIMessageChunk(
                id=message.id,
                content=message.content,
                additional_kwargs=message.additional_kwargs,
                tool_call_chunks=[
                    {"id": a["id"], "name": a["name"], "args": json.dumps(a["args"]), "index": i}
                    for i, a in enumerate(message.tool_calls)
                ],
                chunk_position="last",
            )
        )


def modele(*reponses: BaseMessage) -> ModeleScripte:
    return ModeleScripte(responses=list(reponses))


def appel(nom: str, identifiant: str = "a1", **arguments: Any) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"id": identifiant, "name": nom, "args": arguments}])


def outil(nom: str, donnees: dict[str, Any] | Callable[..., Any], appels: list[str] | None = None) -> BaseTool:
    """Un outil LangChain qui rend ``donnees`` en JSON, comme un outil MCP de Spring ; ``appels`` note chaque appel."""

    def executer(**arguments: Any) -> tuple[str, dict[str, Any]]:
        if appels is not None:
            appels.append(nom)
        valeur = donnees(**arguments) if callable(donnees) else donnees
        # Comme langchain.mcp : le JSON en texte pour le modèle, le contenu structuré en artefact.
        return json.dumps(valeur, ensure_ascii=False), {"structured_content": valeur}

    return StructuredTool.from_function(
        func=executer,
        name=nom,
        description=f"Outil de test {nom}",
        args_schema={"type": "object", "properties": {"periode": {"type": "string"}}},
        response_format="content_and_artifact",
    )


def _nom(outil_lie: Any) -> str:
    if isinstance(outil_lie, dict):
        definition = cast(dict[str, Any], outil_lie)
        fonction = cast(dict[str, Any], definition.get("function") or {})
        return str(definition.get("name") or fonction.get("name"))
    return str(getattr(outil_lie, "name", outil_lie))
