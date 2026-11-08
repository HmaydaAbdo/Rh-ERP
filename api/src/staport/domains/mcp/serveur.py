"""Serveur MCP de Staport Intelligence sur FastMCP 4 (transport Streamable HTTP sans état), dans l'application FastAPI.

`FastMCP.http_app()` rend une application ASGI dont le cycle de vie démarre le gestionnaire de sessions : l'application
hôte doit l'entrer (`combine_lifespans` dans `creer_app`), sans quoi les requêtes échouent. `/mcp` est ajoutée comme une
route de l'application hôte : les autres chemins gardent les 404 et 405 de FastAPI.
"""

from collections.abc import Callable
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.http import StarletteWithLifespan
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.types import ASGIApp, Receive, Scope, Send

from mcp.types import ServerCapabilities, ToolsCapability
from staport.domains.auth.composition import ContexteAuth
from staport.domains.mcp import outils, outils_employe, outils_paie
from staport.domains.mcp.acces import VerificateurJetonAgent

CHEMIN = "/mcp"
NOM = "staport-intelligence"
METADONNEES = "/.well-known/oauth-protected-resource"
INSTRUCTIONS = (
    "Outils de lecture de Staport Intelligence, une entreprise du BTP au Maroc : employés, paie, chantiers, équipes, "
    "fonctions, paramètres et journal d'audit. Chaque outil est limité par les droits de l'utilisateur. Chercher "
    "d'abord l'identifiant d'un chantier, d'une équipe ou d'une fonction avec l'outil de recherche du même domaine."
)


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


class DefiAuthentification:
    """Une requête sans jeton valide reçoit le défi RFC 9728 (`Bearer resource_metadata="<base>/.well-known/..."`)
    (la route est servie par l'application hôte), sans la liste de scopes que FastMCP y ajoute."""

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        entetes = {nom: valeur for nom, valeur in scope["headers"]}
        hote = entetes.get(b"host", b"localhost").decode("latin-1")
        defi = f'Bearer resource_metadata="{scope.get("scheme", "http")}://{hote}{METADONNEES}"'.encode()

        async def envoyer(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start" and message["status"] == 401:
                message["headers"] = [
                    (nom, valeur) for nom, valeur in message["headers"] if nom.lower() != b"www-authenticate"
                ] + [(b"www-authenticate", defi)]
            await send(message)

        await self._app(scope, receive, envoyer)


def creer_serveur(
    contexte: Callable[[], ContexteAuth], fabrique: Callable[[], async_sessionmaker[AsyncSession]]
) -> StarletteWithLifespan:
    """L'application ASGI du serveur MCP, outils et authentification compris. Contexte et fabrique de sessions
    n'existent qu'au démarrage de l'application hôte : ils sont demandés à chaque appel."""
    serveur = FastMCP(
        NOM,
        instructions=INSTRUCTIONS,
        version="1",
        auth=VerificateurJetonAgent(lambda: contexte().agent, fabrique),
    )
    # Seuls les outils sont annoncés à l'initialisation, sans notification de changement (comme Spring AI).
    serveur._mcp_server.get_capabilities = lambda *_, **__: ServerCapabilities(  # type: ignore[method-assign]
        tools=ToolsCapability(list_changed=False)
    )
    outils.enregistrer(serveur, contexte, fabrique)
    outils_employe.enregistrer(serveur, contexte, fabrique)
    outils_paie.enregistrer(serveur, contexte, fabrique)
    application = serveur.http_app(path=CHEMIN, stateless_http=True, json_response=True)
    application.add_middleware(DefiAuthentification)
    application.add_middleware(RefuserOrigine)
    return application
