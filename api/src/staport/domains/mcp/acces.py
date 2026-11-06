"""Authentification de la route `/mcp` (parité avec `McpSecurityConfig` de Spring).

Seul le jeton délégué RS256 de l'agent est accepté (`verifier_jeton_agent` : émetteur, audience MCP, échéance, clé).
À chaque requête, le compte et ses droits sont relus en base : un compte désactivé est refusé (401) même avec un jeton
encore valide. Les droits passent par le mécanisme officiel du SDK, les *scopes* de l'`AccessToken` : le scope de
lecture et `IA_UTILISER` sont exigés par `AuthSettings.required_scopes` (403 s'il manque), puis chaque outil exige la
permission de son écran. Un jeton REST (autre audience) est refusé ici, et un jeton agent l'est par les routes REST.
"""

from collections.abc import Callable

from fastmcp.exceptions import ToolError
from fastmcp.server.auth import AccessToken, TokenVerifier
from fastmcp.server.dependencies import get_access_token
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from staport.domains.auth.securite import PERMISSION_IA, SCOPE_LECTURE
from staport.domains.auth.service_agent import ServiceAgent

SCOPES_EXIGES = [SCOPE_LECTURE, PERMISSION_IA]


class VerificateurJetonAgent(TokenVerifier):
    """`TokenVerifier` du SDK : un jeton valide dont le compte est actif donne l'`AccessToken` de cet appel."""

    def __init__(
        self, agent: Callable[[], ServiceAgent], fabrique: Callable[[], async_sessionmaker[AsyncSession]]
    ) -> None:
        super().__init__(required_scopes=SCOPES_EXIGES)
        self._agent = agent
        self._fabrique = fabrique

    async def verify_token(self, token: str) -> AccessToken | None:
        async with self._fabrique()() as session, session.begin():
            authentifie = await self._agent().authentifier(session, token)
        if authentifie is None:
            return None
        identite, scope = authentifie
        scopes = {*identite.permissions, *identite.roles}
        if SCOPE_LECTURE in scope.split():
            scopes.add(SCOPE_LECTURE)
        return AccessToken(
            token=token, client_id=identite.username, scopes=sorted(scopes), subject=str(identite.utilisateur_id)
        )


class AccesRefuse(ToolError):
    """Une permission manque pour l'outil appelé : le message dit laquelle, l'agent peut l'expliquer à l'utilisateur."""

    def __init__(self, permission: str) -> None:
        super().__init__(f"Accès refusé : la permission {permission} manque à l'utilisateur pour cet outil.")


def exiger_permission(permission: str) -> AccessToken:
    """L'appelant de la requête en cours, s'il détient `permission` ; sinon `AccesRefuse`."""
    jeton = get_access_token()
    if jeton is None or permission not in jeton.scopes:  # jamais d'appel anonyme, même si la route est déjà protégée
        raise AccesRefuse(permission)
    return jeton
