from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.domains.common.schemas import Page
from staport.domains.paie.periode import PeriodePaie, lire_periode
from staport.platform.base_de_donnees import session_requete

from .exceptions import InvalidHeuresSuppPeriode
from .import_fichier import generer_modele
from .repository import TRIS
from .schemas import (
    HeuresSuppAnalytique,
    HeuresSuppCreationRequete,
    HeuresSuppModificationRequete,
    HeuresSuppRecherche,
    HeuresSuppSuppressionMois,
    HeureSuppReponse,
    ImportAnalyse,
    ImportCorrections,
    ImportForfaits,
    ImportPrerequis,
    ImportResultat,
)

Session = Annotated[AsyncSession, Depends(session_requete)]
PageHeures = Annotated[Pagination, Depends(pagination("periode", frozenset(TRIS)))]
heures_supp = APIRouter(prefix="/heures-supp", tags=["Heures supplémentaires"])

LECTURE = (Depends(exiger("HEURES_SUP_READ")), Depends(exiger("PAIE_READ")))


@heures_supp.post("/search", dependencies=list(LECTURE))
async def rechercher(
    corps: HeuresSuppRecherche | None, page: PageHeures, session: Session, contexte: Contexte
) -> Page[HeureSuppReponse]:
    return await contexte.heures_supp.rechercher(session, corps, page)


@heures_supp.get("/periodes", dependencies=list(LECTURE))
async def periodes(session: Session, contexte: Contexte) -> list[PeriodePaie]:
    return await contexte.heures_supp.periodes(session)


@heures_supp.get("/{identifiant}", dependencies=list(LECTURE))
async def lire(identifiant: int, session: Session, contexte: Contexte) -> HeureSuppReponse:
    return await contexte.heures_supp.lire(session, identifiant)


@heures_supp.post("/analytique", dependencies=list(LECTURE))
async def analyser(corps: HeuresSuppRecherche | None, session: Session, contexte: Contexte) -> HeuresSuppAnalytique:
    return await contexte.heures_supp.analyser(session, corps)


@heures_supp.put("/{identifiant}", dependencies=[Depends(exiger("HEURES_SUP_IMPORT")), Depends(exiger("PAIE_READ"))])
async def modifier(
    identifiant: int, corps: HeuresSuppModificationRequete, session: Session, contexte: Contexte
) -> HeureSuppReponse:
    return await contexte.heures_supp.modifier(session, identifiant, corps)


@heures_supp.post(
    "",
    dependencies=[
        Depends(exiger("HEURES_SUP_IMPORT")),
        Depends(exiger("PAIE_READ")),
        Depends(exiger("EMPLOYEE_READ")),
        Depends(exiger("CHANTIER_READ")),
    ],
)
async def creer(corps: HeuresSuppCreationRequete, session: Session, contexte: Contexte) -> HeureSuppReponse:
    return await contexte.heures_supp.creer(session, corps)


@heures_supp.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("HEURES_SUP_DELETE")), Depends(exiger("PAIE_READ"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.heures_supp.supprimer(session, identifiant)


@heures_supp.post("/suppression-mois", dependencies=[Depends(exiger("HEURES_SUP_PURGE")), Depends(exiger("PAIE_READ"))])
async def supprimer_mois(corps: HeuresSuppSuppressionMois, session: Session, contexte: Contexte) -> int:
    return await contexte.heures_supp.supprimer_mois(session, corps.periode, corps.nombre_attendu)


imports = APIRouter(prefix="/heures-supp/import", tags=["Heures supplémentaires — import"])
ChantierId = Annotated[int, Query(alias="chantierId")]
Fichier = Annotated[UploadFile, File()]


def _periode(valeur: str) -> int:
    try:
        return lire_periode(valeur)
    except ValueError as erreur:
        raise InvalidHeuresSuppPeriode(valeur) from erreur


def _partie[T: BaseModel](modele: type[T], brut: str | None) -> T | None:
    if not brut:
        return None
    try:
        return modele.model_validate_json(brut)
    except ValidationError as erreur:
        raise RequestValidationError(erreur.errors()) from erreur


@imports.get(
    "/prerequis",
    dependencies=[Depends(exiger("HEURES_SUP_IMPORT")), Depends(exiger("PAIE_READ")), Depends(exiger("CHANTIER_READ"))],
)
async def prerequis(periode: str, chantier_id: ChantierId, session: Session, contexte: Contexte) -> ImportPrerequis:
    return await contexte.import_heures_supp.prerequis(session, _periode(periode), chantier_id)


@imports.post(
    "/analyse",
    dependencies=[Depends(exiger("HEURES_SUP_IMPORT")), Depends(exiger("PAIE_READ")), Depends(exiger("EMPLOYEE_READ"))],
)
async def analyser_import(
    file: Fichier,
    periode: str,
    chantier_id: ChantierId,
    session: Session,
    contexte: Contexte,
    forfaits: Annotated[str | None, Form()] = None,
) -> ImportAnalyse:
    return await contexte.import_heures_supp.analyser(
        session, file.filename, await file.read(), _periode(periode), chantier_id, _partie(ImportForfaits, forfaits)
    )


@imports.post(
    "/corrections",
    dependencies=[
        Depends(exiger("HEURES_SUP_IMPORT")),
        Depends(exiger("PAIE_READ")),
        Depends(exiger("EMPLOYEE_WRITE")),
        Depends(exiger("FUNCTION_READ")),
    ],
)
async def corriger(
    file: Fichier,
    periode: str,
    chantier_id: ChantierId,
    corrections: Annotated[str, Form()],
    session: Session,
    contexte: Contexte,
    forfaits: Annotated[str | None, Form()] = None,
) -> ImportAnalyse:
    return await contexte.import_heures_supp.corriger(
        session,
        file.filename,
        await file.read(),
        _periode(periode),
        chantier_id,
        _partie(ImportCorrections, corrections) or ImportCorrections(),
        _partie(ImportForfaits, forfaits),
    )


@imports.post(
    "",
    dependencies=[Depends(exiger("HEURES_SUP_IMPORT")), Depends(exiger("PAIE_READ")), Depends(exiger("EMPLOYEE_READ"))],
)
async def importer(
    file: Fichier,
    periode: str,
    chantier_id: ChantierId,
    session: Session,
    contexte: Contexte,
    forfaits: Annotated[str | None, Form()] = None,
) -> ImportResultat:
    return await contexte.import_heures_supp.importer(
        session, file.filename, await file.read(), _periode(periode), chantier_id, _partie(ImportForfaits, forfaits)
    )


@imports.post(
    "/remplacement",
    dependencies=[Depends(exiger("HEURES_SUP_IMPORT")), Depends(exiger("PAIE_READ")), Depends(exiger("EMPLOYEE_READ"))],
)
async def remplacer(
    file: Fichier,
    periode: str,
    chantier_id: ChantierId,
    session: Session,
    contexte: Contexte,
    forfaits: Annotated[str | None, Form()] = None,
) -> ImportResultat:
    return await contexte.import_heures_supp.remplacer(
        session, file.filename, await file.read(), _periode(periode), chantier_id, _partie(ImportForfaits, forfaits)
    )


@imports.get("/modele", dependencies=[Depends(exiger("HEURES_SUP_IMPORT")), Depends(exiger("PAIE_READ"))])
async def modele() -> StreamingResponse:
    return StreamingResponse(
        generer_modele(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Modele_Heures_Supplementaires.xlsx"},
    )
