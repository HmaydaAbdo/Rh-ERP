"""Format d'erreur et gestionnaires d'exceptions transverses (parité avec `GlobalExceptionHandler`, ADR 0016 § 6).

Le corps `{timestamp, status, error, message, path}` et les messages français sont ceux du backend Spring : le
frontend ne doit rien remarquer. Les gestionnaires de domaine se déclarent sur l'application avant ceux-ci ; ce
module ne traite que le transverse et l'imprévu.
"""

import logging
from datetime import UTC, datetime
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

journal = logging.getLogger(__name__)

MESSAGE_CONFLIT = "L'enregistrement a été modifié depuis son chargement. Rechargez-le avant de réessayer."
MESSAGE_REFUS = "Permission insuffisante pour effectuer cette action."
MESSAGE_METHODE = "Méthode non autorisée pour cette route."
MESSAGE_ROUTE = "Route introuvable."
MESSAGE_CORPS = "Corps de la requête illisible."
MESSAGE_IMPREVU = "Une erreur inattendue est survenue."


class ReponseErreur(BaseModel):
    """Corps d'erreur de l'API, identique à `ErrorResponseDto` de Spring."""

    timestamp: datetime
    status: int
    error: str
    message: str
    path: str


class ErreurMetier(Exception):
    """Base des erreurs métier : chaque domaine en hérite et fournit statut et message."""

    statut: HTTPStatus = HTTPStatus.BAD_REQUEST

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ConflitModification(ErreurMetier):
    """Version lue par le client différente de la version courante (HTTP 409)."""

    statut = HTTPStatus.CONFLICT

    def __init__(self) -> None:
        super().__init__(MESSAGE_CONFLIT)


class AccesRefuse(ErreurMetier):
    """Permission insuffisante (HTTP 403)."""

    statut = HTTPStatus.FORBIDDEN

    def __init__(self) -> None:
        super().__init__(MESSAGE_REFUS)


def reponse(requete: Request, statut: HTTPStatus, message: str) -> JSONResponse:
    corps = ReponseErreur(
        timestamp=datetime.now(UTC), status=statut.value, error=statut.phrase, message=message, path=requete.url.path
    )
    return JSONResponse(status_code=statut.value, content=corps.model_dump(mode="json"))


def _message_validation(erreur: RequestValidationError) -> str:
    """`champ : message`, séparés par une virgule, comme `MethodArgumentNotValidException` côté Spring."""
    parties: list[str] = []
    for detail in erreur.errors():
        champ = ".".join(str(p) for p in detail["loc"] if p not in ("body", "query", "path"))
        parties.append(f"{champ} : {detail['msg']}")
    return ", ".join(parties)


def enregistrer_gestionnaires(app: FastAPI) -> None:
    @app.exception_handler(ErreurMetier)
    async def _metier(requete: Request, exc: ErreurMetier) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        return reponse(requete, exc.statut, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(  # pyright: ignore[reportUnusedFunction]
        requete: Request, exc: RequestValidationError
    ) -> JSONResponse:
        corps_illisible = any(
            d["type"] in ("json_invalid", "missing") and d["loc"][:1] == ("body",) for d in exc.errors()
        )
        if corps_illisible and any(d["type"] == "json_invalid" for d in exc.errors()):
            return reponse(requete, HTTPStatus.BAD_REQUEST, MESSAGE_CORPS)
        return reponse(requete, HTTPStatus.BAD_REQUEST, _message_validation(exc))

    @app.exception_handler(StarletteHTTPException)
    async def _http(  # pyright: ignore[reportUnusedFunction]
        requete: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        if exc.status_code == HTTPStatus.NOT_FOUND:
            return reponse(requete, HTTPStatus.NOT_FOUND, MESSAGE_ROUTE)
        if exc.status_code == HTTPStatus.METHOD_NOT_ALLOWED:
            return reponse(requete, HTTPStatus.METHOD_NOT_ALLOWED, MESSAGE_METHODE)
        statut = HTTPStatus(exc.status_code)
        return reponse(requete, statut, str(exc.detail))

    @app.exception_handler(Exception)
    async def _imprevu(requete: Request, exc: Exception) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        journal.error("Erreur inattendue lors d'une requête HTTP : méthode=%s", requete.method, exc_info=exc)
        return reponse(requete, HTTPStatus.INTERNAL_SERVER_ERROR, MESSAGE_IMPREVU)
