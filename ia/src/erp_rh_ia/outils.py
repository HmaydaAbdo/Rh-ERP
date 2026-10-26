"""Outils métier d'ERP-RH, uniquement par MCP et avec le jeton agent de l'utilisateur (docs/ia.md, § 5 et T10).

Les outils viennent du support MCP intégré à LangChain (``langchain.mcp``, client FastMCP) : chaque outil MCP de Spring
devient un outil LangChain pour ``create_agent``. Seule la délégation d'identité reste à nous : Spring échange le jeton de
connexion contre un jeton agent court, porté par chaque appel MCP.
"""

import warnings

import httpx
from fastmcp.client import Client
from fastmcp.client.transports import StreamableHttpTransport
from langchain_core.tools import BaseTool

with warnings.catch_warnings():
    warnings.simplefilter("ignore")  # langchain.mcp est publié en bêta : avertissement à l'import seulement
    from langchain.mcp import MCPAdapter


async def jeton_agent(client: httpx.AsyncClient, api: str, jeton_connexion: str) -> str:
    """Échange le jeton de connexion de l'utilisateur contre son jeton agent (RS256, 5 minutes) auprès de Spring.

    Spring vérifie la connexion et le droit ``IA_UTILISER`` ; une erreur HTTP remonte telle quelle (401, 403, 404).
    """
    reponse = await client.post(f"{api}/auth/jetons/agent", headers={"Authorization": f"Bearer {jeton_connexion}"})
    reponse.raise_for_status()
    return str(reponse.json()["jeton"])


async def outils_erp(url_mcp: str, jeton_agent: str, delai_secondes: float = 30.0) -> list[BaseTool]:
    """Le catalogue MCP de Spring en outils LangChain ; le jeton agent n'est jamais journalisé ni conservé."""
    transport = StreamableHttpTransport(url_mcp, headers={"Authorization": f"Bearer {jeton_agent}"})
    return await MCPAdapter(Client(transport, timeout=delai_secondes)).list_tools()
