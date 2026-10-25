"""Preuve T3 (docs/ia.md) : le client MCP Python officiel contre le serveur Java du profil Maven
`mcp-compatibility`. Mêmes scénarios que le client TypeScript de la preuve J0.

Lancé par `McpCompatibilityTest` avec MCP_COMPATIBILITY_URL ; ignoré sinon. Seul le serveur de
test loopback est admis.
"""

import os
import re
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import urlparse

import httpx
import httpx2
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client
from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS, CallToolResult, Implementation, TextContent

URL = os.environ.get("MCP_COMPATIBILITY_URL", "")
pytestmark = [
    pytest.mark.anyio,
    pytest.mark.skipif(not URL, reason="MCP_COMPATIBILITY_URL absent : lancé par McpCompatibilityTest"),
]
TRACE_INTERNE = re.compile(r"java\.|Exception|\bat .+\(.+:\d+\)")
DELAI = 5.0


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def serveur_loopback() -> None:
    adresse = urlparse(URL)
    assert (adresse.scheme, adresse.hostname, adresse.path) == ("http", "127.0.0.1", "/mcp")


@asynccontextmanager
async def connexion(sessions: list[str] | None = None) -> AsyncGenerator[ClientSession]:
    async def relever_session(reponse: httpx2.Response) -> None:
        identifiant = reponse.headers.get("mcp-session-id")
        if sessions is not None and identifiant and identifiant not in sessions:
            sessions.append(identifiant)

    client_http = create_mcp_http_client()
    client_http.event_hooks["response"].append(relever_session)
    async with client_http, streamable_http_client(URL, http_client=client_http) as (lecture, ecriture):
        session = ClientSession(
            lecture,
            ecriture,
            read_timeout_seconds=DELAI,
            client_info=Implementation(name="erp-rh-compatibility-client-python", version="T3"),
        )
        async with session:
            # Poignée de main explicite : la révision commune avec le SDK Java 2.1.0 est 2025-11-25.
            await session.initialize()
            yield session


async def appeler(session: ClientSession, arguments: dict[str, Any]) -> CallToolResult:
    resultat = await session.call_tool("compat_echo", arguments)
    assert isinstance(resultat, CallToolResult)
    return resultat


async def test_initialise_une_revision_commune_et_decouvre_les_capacites() -> None:
    sessions: list[str] = []
    async with connexion(sessions) as session:
        assert session.protocol_version == "2025-11-25"
        assert session.server_info is not None
        assert (session.server_info.name, session.server_info.version) == ("erp-rh-compatibility", "P1.1")
        capacites = session.server_capabilities
        assert capacites is not None and capacites.tools is not None
        assert sessions


async def test_decouvre_uniquement_le_contrat_synthetique_borne() -> None:
    async with connexion() as session:
        outils = (await session.list_tools()).tools
    assert [outil.name for outil in outils] == ["compat_echo"]
    outil = outils[0]
    assert outil.input_schema["required"] == ["message"]
    assert outil.input_schema["additionalProperties"] is False
    assert outil.output_schema is not None
    assert outil.output_schema["required"] == ["message", "synthetic"]


async def test_preserve_unicode_guillemets_et_html_dans_un_resultat_structure() -> None:
    message = 'Équipe «démo» مرحبا 🏗️ <script> " \\'
    async with connexion() as session:
        resultat = await appeler(session, {"message": message})
    assert resultat.is_error is False
    assert resultat.structured_content == {"message": message, "synthetic": True}
    assert resultat.content == [TextContent(type="text", text=message)]


@pytest.mark.parametrize(
    "arguments",
    [
        pytest.param({"message": 42}, id="type incorrect"),
        pytest.param(
            {"message": "démo", "userId": "VALEUR_SYNTHETIQUE_A_NE_PAS_RETOURNER"},
            id="propriété supplémentaire",
        ),
        pytest.param({}, id="argument absent"),
        pytest.param({"message": ""}, id="texte vide"),
        pytest.param({"message": "x" * 81}, id="texte trop long"),
    ],
)
async def test_refuse_par_schema(arguments: dict[str, Any]) -> None:
    async with connexion() as session:
        resultat = await appeler(session, arguments)
    assert resultat.is_error is True
    assert len(resultat.content) == 1
    contenu = resultat.content[0]
    assert isinstance(contenu, TextContent)
    assert contenu.text.startswith("Tool (compat_echo) input validation failed:")
    assert len(contenu.text) < 1_024
    assert "VALEUR_SYNTHETIQUE_A_NE_PAS_RETOURNER" not in contenu.text
    assert not TRACE_INTERNE.search(contenu.text)
    assert resultat.structured_content is None


async def test_refuse_un_outil_inconnu_par_une_erreur_mcp_structuree() -> None:
    async with connexion() as session:
        with pytest.raises(MCPError) as erreur:
            await session.call_tool("outil_inconnu", {})
    assert erreur.value.code == INVALID_PARAMS
    assert not TRACE_INTERNE.search(erreur.value.message)


async def test_termine_la_session_et_refuse_sa_reutilisation() -> None:
    sessions: list[str] = []
    async with connexion(sessions) as session:
        await session.list_tools()
    # La sortie du transport a envoyé DELETE : la session ne doit plus être acceptée.
    assert len(sessions) == 1
    async with httpx.AsyncClient(timeout=DELAI) as client:
        reponse = await client.post(
            URL,
            headers={
                "content-type": "application/json",
                "accept": "application/json, text/event-stream",
                "mcp-session-id": sessions[0],
                "mcp-protocol-version": "2025-11-25",
            },
            json={"jsonrpc": "2.0", "id": "after-close", "method": "tools/list", "params": {}},
        )
    assert reponse.status_code == 404
