"""Outils métier de Staport Intelligence, uniquement par MCP et avec le jeton agent de l'utilisateur
(site/docs/ia, § 5 et T10).

Les outils viennent du support MCP intégré à LangChain (``langchain.mcp``, client FastMCP) : chaque outil MCP de
l'API ERP devient un outil LangChain pour ``create_deep_agent``. Seule la délégation d'identité reste à nous : l'API
échange le jeton de connexion contre un jeton agent court, porté par chaque appel MCP.
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
    """Échange le jeton de connexion de l'utilisateur contre son jeton agent (RS256, 5 minutes) auprès de l'API.

    L'API vérifie la connexion et le droit ``IA_UTILISER`` ; une erreur HTTP remonte telle quelle (401, 403, 404).
    """
    reponse = await client.post(f"{api}/auth/jetons/agent", headers={"Authorization": f"Bearer {jeton_connexion}"})
    reponse.raise_for_status()
    return str(reponse.json()["jeton"])


async def outils_erp(url_mcp: str, jeton_agent: str, delai_secondes: float = 30.0) -> list[BaseTool]:
    """Le catalogue MCP de l'API ERP en outils LangChain ; le jeton agent n'est jamais journalisé ni conservé."""
    transport = StreamableHttpTransport(url_mcp, headers={"Authorization": f"Bearer {jeton_agent}"})
    # Mode de transport MCP commun du client FastMCP.
    return await MCPAdapter(Client(transport, timeout=delai_secondes, mode="legacy")).list_tools()


#: Ressource MCP du contexte du moment (date, dernier mois de paie), calculée par l'API selon les droits de l'appelant.
URI_CONTEXTE = "erp://contexte"


async def contexte_erp(url_mcp: str, jeton_agent: str, delai_secondes: float = 30.0) -> str:
    """Le texte de la ressource de contexte de l'API ERP, ou une chaîne vide si elle est indisponible : une panne
    laisse l'instruction du modèle plus courte, jamais la question sans réponse."""
    transport = StreamableHttpTransport(url_mcp, headers={"Authorization": f"Bearer {jeton_agent}"})
    try:
        async with Client(transport, timeout=delai_secondes, mode="legacy") as client:
            contenus = await client.read_resource(URI_CONTEXTE)
    except Exception:  # API indisponible ou ressource refusée : pas de contexte, la question continue
        return ""
    return "\n".join(getattr(c, "text", "") for c in contenus).strip()
