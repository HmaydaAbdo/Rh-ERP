"""Serveur MCP d'ERP-RH sur FastMCP 4 (transport Streamable HTTP sans état), monté dans l'application FastAPI.

`FastMCP.http_app()` rend une application ASGI dont le cycle de vie démarre le gestionnaire de sessions : l'application
hôte doit l'entrer (`combine_lifespans` dans `creer_app`), sans quoi les requêtes échouent. `/mcp` est ajoutée comme une
route de l'application hôte : les autres chemins gardent les 404 et 405 de FastAPI.
"""

from collections.abc import Callable

from fastmcp import FastMCP
from fastmcp.server.http import StarletteWithLifespan
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.types import ASGIApp, Receive, Scope, Send

from staport.domains.auth.composition import ContexteAuth
from staport.domains.mcp import outils, outils_employe, outils_paie
from staport.domains.mcp.acces import VerificateurJetonAgent

CHEMIN = "/mcp"


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
) -> StarletteWithLifespan:
    """L'application ASGI du serveur MCP, outils et authentification compris. Contexte et fabrique de sessions
    n'existent qu'au démarrage de l'application hôte : ils sont demandés à chaque appel."""
    serveur = FastMCP("erp-rh", auth=VerificateurJetonAgent(lambda: contexte().agent, fabrique))
    outils.enregistrer(serveur, contexte, fabrique)
    outils_employe.enregistrer(serveur, contexte, fabrique)
    outils_paie.enregistrer(serveur, contexte, fabrique)
    application = serveur.http_app(path=CHEMIN, stateless_http=True, json_response=True)
    application.add_middleware(RefuserOrigine)
    return application
