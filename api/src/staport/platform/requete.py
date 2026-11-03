"""Identifiant de requête (parité avec `MdcRequestFilter` de Spring).

L'identifiant est **toujours généré ici**, jamais repris d'un en-tête du client (un client ne doit pas pouvoir le
choisir), posé dans une variable de contexte pour relier journaux techniques et journal d'audit, et renvoyé dans
`X-Request-Id`.
"""

import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar

from fastapi import FastAPI, Request, Response

EN_TETE_REQUEST_ID = "X-Request-Id"

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def request_id_courant() -> str | None:
    return _request_id.get()


def enregistrer_identifiant_requete(app: FastAPI) -> None:
    @app.middleware("http")
    async def _poser(  # pyright: ignore[reportUnusedFunction]
        requete: Request, suite: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        identifiant = str(uuid.uuid4())
        jeton = _request_id.set(identifiant)
        try:
            reponse = await suite(requete)
        finally:
            _request_id.reset(jeton)
        reponse.headers[EN_TETE_REQUEST_ID] = identifiant
        return reponse
