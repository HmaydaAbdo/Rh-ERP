"""Outils métier de Staport Intelligence, uniquement par MCP et avec le jeton agent de l'utilisateur
(site/docs/ia, § 5 et T10).

Les outils viennent du support MCP intégré à LangChain (``langchain.mcp``, client FastMCP) : chaque outil MCP de
l'API ERP devient un outil LangChain pour ``create_deep_agent``. La délégation d'identité est un échange de jetons
OAuth2 (RFC 8693, client d'Authlib) : le jeton de connexion contre un jeton agent court, porté par chaque appel MCP.
"""

import warnings
from typing import Any

from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastmcp.client import Client
from fastmcp.client.transports import StreamableHttpTransport
from langchain_core.tools import BaseTool

with warnings.catch_warnings():
    warnings.simplefilter("ignore")  # langchain.mcp est publié en bêta : avertissement à l'import seulement
    from langchain.mcp import MCPAdapter


#: Identifiant OAuth2 du service IA auprès de l'API (client public : le jeton de connexion est la seule preuve).
CLIENT_ID = "staport-ia"
TYPE_ECHANGE = "urn:ietf:params:oauth:grant-type:token-exchange"
TYPE_JETON_ACCES = "urn:ietf:params:oauth:token-type:access_token"
AUDIENCE_MCP = "staport-intelligence-mcp"


class EchangeRefuse(Exception):  # nom du domaine, pas une erreur technique
    """L'API a refusé l'échange ; ``erreur`` est le code OAuth2 du RFC 6749 (``invalid_grant``, ``access_denied``…)."""

    def __init__(self, erreur: str) -> None:
        super().__init__(erreur)
        self.erreur = erreur


async def jeton_agent(api: str, jeton_connexion: str, delai_secondes: float = 30.0) -> str:
    """Échange le jeton de connexion de l'utilisateur contre son jeton agent (JWT RS256, 5 minutes) auprès de l'API.

    L'API vérifie la connexion et relit le droit ``IA_UTILISER`` ; un refus remonte en ``EchangeRefuse``.
    """
    # Le client d'Authlib hérite d'httpx, que son typage ne résout pas : il est manipulé comme ``Any``.
    client: Any = AsyncOAuth2Client(
        client_id=CLIENT_ID,
        token_endpoint_auth_method="none",  # noqa: S106  # client public, pas un mot de passe
        timeout=delai_secondes,
    )
    async with client:
        try:
            jeton = await client.fetch_token(
                f"{api}/oauth/token",
                grant_type=TYPE_ECHANGE,
                subject_token=jeton_connexion,
                subject_token_type=TYPE_JETON_ACCES,
                audience=AUDIENCE_MCP,
            )
        except OAuthError as refus:
            raise EchangeRefuse(str(refus.error)) from None
    acces = jeton.get("access_token")
    if not acces:
        raise EchangeRefuse("reponse_invalide")
    return str(acces)


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
