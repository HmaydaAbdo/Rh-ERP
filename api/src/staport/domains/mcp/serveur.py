"""Montage du serveur MCP dans l'application FastAPI (SDK MCP officiel, transport Streamable HTTP sans état).

`streamable_http_app()` rend une application Starlette dont le gestionnaire de sessions doit être démarré par
l'application hôte : le cycle de vie de `creer_app` entre dans `session_manager.run()` (la documentation du SDK précise
que le cycle de vie d'une sous-application montée ne s'exécute jamais). `/mcp` est ajoutée comme une route : les
autres chemins gardent les 404 et 405 de FastAPI.
"""

from collections.abc import Callable

from pydantic import AnyHttpUrl
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.applications import Starlette
from starlette.types import ASGIApp, Receive, Scope, Send

from mcp.server import MCPServer
from mcp.server.auth.settings import AuthSettings
from mcp.server.transport_security import TransportSecuritySettings
from staport.domains.auth.composition import ContexteAuth
from staport.domains.mcp import outils
from staport.domains.mcp.acces import SCOPES_EXIGES, VerificateurJetonAgent

CHEMIN = "/mcp"
# L'émetteur est nominal : le serveur ne délivre aucun jeton OAuth, il vérifie seulement celui de l'application.
EMETTEUR_NOMINAL = AnyHttpUrl("http://erp-rh.invalid")


class RefuserOrigine:
    """Un navigateur n'appelle jamais MCP : seul le service IA l'appelle, par le réseau interne. Toute requête qui
    porte un en-tête `Origin` est refusée avant même l'authentification (403)."""

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and any(nom == b"origin" for nom, _ in scope["headers"]):
            corps = b'{"error":"origin_refusee"}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 403,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(corps)).encode())],
                }
            )
            await send({"type": "http.response.body", "body": corps})
            return
        await self._app(scope, receive, send)


def creer_serveur(
    contexte: Callable[[], ContexteAuth], fabrique: Callable[[], async_sessionmaker[AsyncSession]]
) -> tuple[MCPServer, Starlette]:
    """Le serveur MCP, ses outils et son application ASGI authentifiée (à monter, avec son gestionnaire de sessions
    démarré par le cycle de vie de l'application hôte). Contexte et fabrique de sessions n'existent qu'au démarrage de
    l'application : ils sont demandés à chaque appel."""
    serveur = MCPServer(
        "erp-rh",
        token_verifier=VerificateurJetonAgent(lambda: contexte().agent, fabrique),
        auth=AuthSettings(
            issuer_url=EMETTEUR_NOMINAL,
            resource_server_url=None,
            required_scopes=SCOPES_EXIGES,
            validate_token_resource=False,
        ),
    )
    outils.enregistrer(serveur, contexte, fabrique)
    application = serveur.streamable_http_app(
        streamable_http_path=CHEMIN,
        stateless_http=True,
        json_response=True,
        # La protection contre le DNS rebinding vise un serveur lié à localhost ; ici le service n'est joint que par le
        # réseau interne, sous le nom de son conteneur, et `RefuserOrigine` écarte déjà tout appel de navigateur.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    application.add_middleware(RefuserOrigine)
    return serveur, application
