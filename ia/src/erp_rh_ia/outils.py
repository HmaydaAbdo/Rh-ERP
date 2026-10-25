"""Accès aux outils métier d'ERP-RH, uniquement par MCP et avec le jeton agent de l'utilisateur (docs/ia.md, § 5)."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client
from mcp.types import Implementation, TextContent


@dataclass(frozen=True)
class OutilDecrit:
    nom: str
    description: str
    schema_entree: dict[str, Any]


@dataclass(frozen=True)
class ResultatOutil:
    outil: str
    arguments: dict[str, Any]
    est_erreur: bool
    texte: str
    donnees: dict[str, Any] = field(default_factory=lambda: {})

    @property
    def refuse(self) -> bool:
        """Refus d'autorisation : jamais retenté par l'agent."""
        return self.est_erreur and self.texte.startswith("Accès refusé")


class Outils(Protocol):
    async def lister(self) -> list[OutilDecrit]: ...

    async def appeler(self, nom: str, arguments: dict[str, Any]) -> ResultatOutil: ...


class OutilsMcp:
    """Session MCP ouverte pour une question : catalogue et appels avec l'identité de l'utilisateur."""

    def __init__(self, session: ClientSession) -> None:
        self._session = session

    async def lister(self) -> list[OutilDecrit]:
        outils = (await self._session.list_tools()).tools
        return [OutilDecrit(o.name, o.description or "", dict(o.input_schema)) for o in outils]

    async def appeler(self, nom: str, arguments: dict[str, Any]) -> ResultatOutil:
        resultat = await self._session.call_tool(nom, arguments)
        texte = " ".join(c.text for c in resultat.content if isinstance(c, TextContent))
        donnees = dict(resultat.structured_content or {})
        return ResultatOutil(nom, arguments, bool(resultat.is_error), texte, donnees)


async def jeton_agent(client: httpx.AsyncClient, api: str, jeton_connexion: str) -> str:
    """Échange le jeton de connexion de l'utilisateur contre son jeton agent (RS256, 5 minutes) auprès de Spring.

    Spring vérifie la connexion et le droit ``IA_UTILISER`` ; une erreur HTTP remonte telle quelle (401, 403, 404).
    """
    reponse = await client.post(f"{api}/auth/jetons/agent", headers={"Authorization": f"Bearer {jeton_connexion}"})
    reponse.raise_for_status()
    return str(reponse.json()["jeton"])


@asynccontextmanager
async def ouvrir_outils(url: str, jeton_agent: str, delai_secondes: float = 30.0) -> AsyncGenerator[OutilsMcp]:
    """Le jeton agent n'est jamais journalisé ni conservé au-delà de la session."""
    async with (
        create_mcp_http_client(headers={"Authorization": f"Bearer {jeton_agent}"}) as client_http,
        streamable_http_client(url, http_client=client_http) as (lecture, ecriture),
    ):
        session = ClientSession(
            lecture,
            ecriture,
            read_timeout_seconds=delai_secondes,
            client_info=Implementation(name="erp-rh-ia", version="1"),
        )
        async with session:
            await session.initialize()
            yield OutilsMcp(session)
