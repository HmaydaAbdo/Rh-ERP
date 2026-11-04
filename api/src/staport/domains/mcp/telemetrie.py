"""Observation d'un appel d'outil : un span OpenTelemetry, jamais une écriture au journal d'audit.

Décision du propriétaire (2026-11-04) : les lectures MCP ne sont pas des opérations d'audit ; Phoenix porte leur
diagnostic. Le span décrit l'appel (outil, utilisateur pour qui l'agent agit, statut, nombre de résultats) sans copier
ni les arguments ni le résultat : les contenus restent dans la trace de l'agent, côté client.
"""

import functools
from collections.abc import Awaitable, Callable

from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

from staport.domains.auth.securite import SCOPE_LECTURE
from staport.domains.mcp.acces import AccesRefuse, exiger_permission

_tracer = trace.get_tracer("staport.mcp")


def outil[**P, R](
    nom: str, permission: str | None, compter: Callable[[R], int | None] = lambda _: None
) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
    """Enveloppe d'un outil : permission exigée (relue en base à chaque requête), span, nombre de résultats.

    `permission=None` : l'outil n'exige que le droit d'utiliser l'assistant en lecture (identité de l'appelant).
    """

    def decorateur(fonction: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @functools.wraps(fonction)
        async def appeler(*args: P.args, **kwargs: P.kwargs) -> R:
            with _tracer.start_as_current_span(f"mcp.outil {nom}") as span:
                span.set_attribute("mcp.outil", nom)
                try:
                    jeton = exiger_permission(permission or SCOPE_LECTURE)
                    span.set_attribute("enduser.id", jeton.client_id)
                    resultat = await fonction(*args, **kwargs)
                except AccesRefuse:
                    span.set_attribute("mcp.statut", "REFUSE")
                    span.set_status(Status(StatusCode.ERROR, "acces refuse"))
                    raise
                except Exception as erreur:
                    span.set_attribute("mcp.statut", "ECHEC")
                    span.record_exception(erreur)
                    span.set_status(Status(StatusCode.ERROR, type(erreur).__name__))
                    raise
                span.set_attribute("mcp.statut", "SUCCES")
                nombre = compter(resultat)
                if nombre is not None:
                    span.set_attribute("mcp.resultats", nombre)
                return resultat

        return appeler

    return decorateur
