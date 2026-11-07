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
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException

from staport.platform.validation_fr import message_fr

journal = logging.getLogger(__name__)

MESSAGE_CONFLIT = "L'enregistrement a été modifié depuis son chargement. Rechargez-le avant de réessayer."
MESSAGE_REFUS = "Permission insuffisante pour effectuer cette action."
MESSAGE_METHODE = "Méthode non autorisée pour cette route."
MESSAGE_ROUTE = "Route introuvable."
MESSAGE_CORPS = "Corps de la requête illisible."
MESSAGE_IMPREVU = "Une erreur inattendue est survenue."
TYPES_CORPS_ILLISIBLE = frozenset(
    {
        "json_invalid", "enum", "literal_error", "date_parsing", "date_type", "date_from_datetime_parsing",
        "datetime_parsing", "datetime_type", "time_parsing", "int_parsing", "int_type", "int_from_float",
        "float_parsing", "float_type", "decimal_parsing", "decimal_type", "bool_parsing", "bool_type",
        "string_type", "list_type", "dict_type", "uuid_parsing", "model_attributes_type", "model_type",
    }
)  # fmt: skip
TYPES_PARAMETRE_ILLISIBLE = TYPES_CORPS_ILLISIBLE - {"json_invalid"}
NOMS_PARAMETRES_SPRING = {"identifiant": "id"}  # Spring nomme le paramètre de chemin `id`, l'API Python `identifiant`


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


class NonAuthentifie(Exception):
    """Jeton absent ou invalide (HTTP 401 sans corps, en-tête `WWW-Authenticate: Bearer`, comme Spring Security)."""

    def __init__(self, jeton_invalide: bool = False) -> None:
        super().__init__("non authentifié")
        self.jeton_invalide = jeton_invalide


def reponse(requete: Request, statut: HTTPStatus, message: str) -> JSONResponse:
    corps = ReponseErreur(
        timestamp=datetime.now(UTC), status=statut.value, error=statut.phrase, message=message, path=requete.url.path
    )
    return JSONResponse(status_code=statut.value, content=corps.model_dump(mode="json"))


def _periode_corps_illisible(requete: Request) -> bool:
    """Heures supp et paie (hors export/rapport) : un `YearMonth` mal formé rend le corps illisible côté Spring."""
    chemin = requete.url.path
    sortie = chemin in ("/paie/export", "/paie/report/pdf")
    return (chemin.startswith("/heures-supp/") or (chemin.startswith("/paie") and not sortie)) and _corps_json(requete)


def _corps_json(requete: Request) -> bool:
    return requete.headers.get("content-type", "").startswith("application/json")


def _message_validation(erreur: RequestValidationError) -> str:
    """`champ : message`, séparés par une virgule, comme `MethodArgumentNotValidException` côté Spring."""
    parties: list[str] = []
    for detail in erreur.errors():
        champ = (
            detail["ctx"]["champ"]
            if detail["type"] == "regle_metier"
            else ".".join(str(p) for p in detail["loc"] if p not in ("body", "query", "path"))
        )
        parties.append(f"{champ} : {message_fr(detail)}")
    return ", ".join(parties)


def enregistrer_gestionnaires(app: FastAPI) -> None:
    @app.exception_handler(ErreurMetier)
    async def _metier(requete: Request, exc: ErreurMetier) -> JSONResponse:  # pyright: ignore[reportUnusedFunction]
        return reponse(requete, exc.statut, exc.message)

    @app.exception_handler(NonAuthentifie)
    async def _non_authentifie(  # pyright: ignore[reportUnusedFunction]
        _requete: Request, exc: NonAuthentifie
    ) -> Response:
        en_tete = 'Bearer error="invalid_token"' if exc.jeton_invalide else "Bearer"
        return Response(status_code=HTTPStatus.UNAUTHORIZED, headers={"WWW-Authenticate": en_tete})

    @app.exception_handler(StaleDataError)
    async def _conflit_orm(  # pyright: ignore[reportUnusedFunction]
        requete: Request, _exc: StaleDataError
    ) -> JSONResponse:
        return reponse(requete, HTTPStatus.CONFLICT, MESSAGE_CONFLIT)

    @app.exception_handler(RequestValidationError)
    async def _validation(  # pyright: ignore[reportUnusedFunction]
        requete: Request, exc: RequestValidationError
    ) -> JSONResponse:
        erreurs = exc.errors()
        # Jackson refuse le corps entier (JSON invalide, corps absent, type, énumération ou date impossible à lire) :
        # `HttpMessageNotReadableException` côté Spring, donc un message unique, sans détail de champ.
        if any(
            d["loc"][:1] == ("body",)
            and (d["type"] in TYPES_CORPS_ILLISIBLE or (d["loc"] == ("body",) and d["type"] == "missing"))
            for d in erreurs
        ):
            return reponse(requete, HTTPStatus.BAD_REQUEST, MESSAGE_CORPS)
        for d in erreurs:
            if d["loc"][-1:] == ("periode",):
                # Heures supp : `YearMonth` d'un corps JSON mal formé → corps illisible côté Spring.
                if d["type"] != "missing" and _periode_corps_illisible(requete):
                    return reponse(requete, HTTPStatus.BAD_REQUEST, MESSAGE_CORPS)
                if d["type"] == "missing":
                    if _corps_json(requete):  # DTO : Spring le contrôle
                        return reponse(
                            requete,
                            HTTPStatus.BAD_REQUEST,
                            "Période obligatoire, format attendu aaaa-MM (ex. 2026-08).",
                        )
                    return reponse(requete, HTTPStatus.BAD_REQUEST, "Paramètre obligatoire absent : periode.")
                return reponse(
                    requete,
                    HTTPStatus.BAD_REQUEST,
                    f"Période invalide, format attendu aaaa-MM (ex. 2026-08) : {d.get('input', '')}",
                )
        # Paramètre de chemin ou de requête illisible : `MethodArgumentTypeMismatchException` côté Spring.
        for d in erreurs:
            if d["loc"][:1] in (("path",), ("query",)) and d["type"] in TYPES_PARAMETRE_ILLISIBLE:
                nom = str(d["loc"][1])
                return reponse(
                    requete,
                    HTTPStatus.BAD_REQUEST,
                    f"Valeur invalide pour le paramètre : {NOMS_PARAMETRES_SPRING.get(nom, nom)}.",
                )
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
