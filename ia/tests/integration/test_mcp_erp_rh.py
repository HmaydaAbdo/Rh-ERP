"""Preuve T4 (docs/ia.md) : le client MCP Python officiel appelle la vraie route /mcp avec un jeton agent.

Lancé par `McpClientPythonIntegrationTest` (application complète, base de test) avec MCP_ERP_RH_URL,
MCP_ERP_RH_JETON et MCP_ERP_RH_UTILISATEUR ; ignoré sinon. Seul un serveur loopback est admis.
"""

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared._httpx_utils import create_mcp_http_client
from mcp.types import CallToolResult, Implementation

URL = os.environ.get("MCP_ERP_RH_URL", "")
JETON = os.environ.get("MCP_ERP_RH_JETON", "")
UTILISATEUR = os.environ.get("MCP_ERP_RH_UTILISATEUR", "")
pytestmark = [
    pytest.mark.anyio,
    pytest.mark.skipif(not URL, reason="MCP_ERP_RH_URL absent : lancé par McpClientPythonIntegrationTest"),
]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def serveur_loopback() -> None:
    adresse = urlparse(URL)
    assert (adresse.scheme, adresse.hostname, adresse.path) == ("http", "127.0.0.1", "/mcp")


@asynccontextmanager
async def connexion(jeton: str | None) -> AsyncGenerator[ClientSession]:
    entetes = {"Authorization": f"Bearer {jeton}"} if jeton else None
    async with (
        create_mcp_http_client(headers=entetes) as client_http,
        streamable_http_client(URL, http_client=client_http) as (lecture, ecriture),
    ):
        session = ClientSession(
            lecture,
            ecriture,
            read_timeout_seconds=10.0,
            client_info=Implementation(name="erp-rh-ia", version="T4"),
        )
        async with session:
            await session.initialize()
            yield session


async def test_le_jeton_agent_ouvre_le_catalogue_et_l_identite_vient_du_serveur() -> None:
    async with connexion(JETON) as session:
        assert session.protocol_version == "2025-11-25"
        outils = [outil.name for outil in (await session.list_tools()).tools]
        resultat = await session.call_tool("systeme_identite", {})
    # Catalogue complet : identité + 27 outils de lecture (docs/ia.md, § 8).
    assert len(outils) == 28
    attendus = {"systeme_identite", "paie_indicateurs", "employes_rechercher", "chantier_rechercher"}
    assert attendus <= set(outils)
    assert isinstance(resultat, CallToolResult)
    assert resultat.is_error is False
    assert resultat.structured_content is not None
    assert resultat.structured_content["utilisateur"] == UTILISATEUR
    assert "IA_UTILISER" in resultat.structured_content["autorites"]


async def test_sans_jeton_le_serveur_refuse_la_connexion() -> None:
    with pytest.raises(BaseException):  # noqa: B017  # 401 du serveur, quelle que soit l'exception du transport
        async with connexion(None):
            pass
