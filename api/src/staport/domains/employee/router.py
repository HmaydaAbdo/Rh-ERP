from dataclasses import replace
from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Authentifie, Contexte, exiger
from staport.domains.auth.securite import JetonAcces
from staport.domains.common.pagination import Pagination, pagination
from staport.platform.base_de_donnees import session_requete

from .repository import CHAMPS_DE_PAIE, TRIS_PUBLICS
from .schemas import (
    DimensionEmployes,
    EmployeeAnalytiqueReponse,
    EmployeeCreationRequete,
    EmployeeImportReponse,
    EmployeeModificationRequete,
    EmployeeRecherche,
    EmployeeRegroupementReponse,
    EmployeeReponse,
    EmployeeSortiesMoisReponse,
    EmployeeSortiesRecherche,
)

Session = Annotated[AsyncSession, Depends(session_requete)]
employees = APIRouter(prefix="/employees", tags=["Employés"])


def paie(acces: JetonAcces) -> bool:
    return "PAIE_READ" in acces.permissions or "PAIE_READ" in acces.roles


def page_employes(
    brute: Annotated[Pagination, Depends(pagination("nomPrenom", TRIS_PUBLICS))], acces: Authentifie
) -> Pagination:
    """Sans `PAIE_READ`, les tris sur les champs de paie sont retirés (Spring) : ils feraient deviner les salaires."""
    if paie(acces):
        return brute
    return replace(brute, tri=tuple(t for t in brute.tri if t[0] not in CHAMPS_DE_PAIE))


PageEmployees = Annotated[Pagination, Depends(page_employes)]


@employees.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(exiger("EMPLOYEE_WRITE"))])
async def creer(
    corps: EmployeeCreationRequete, session: Session, contexte: Contexte, acces: Authentifie
) -> EmployeeReponse:
    return await contexte.employees.creer(session, corps, paie(acces))


@employees.put("/{identifiant}", dependencies=[Depends(exiger("EMPLOYEE_WRITE"))])
async def modifier(
    identifiant: int, corps: EmployeeModificationRequete, session: Session, contexte: Contexte, acces: Authentifie
) -> EmployeeReponse:
    return await contexte.employees.modifier(session, identifiant, corps, paie(acces))


@employees.get("/{identifiant}", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def lire(identifiant: int, session: Session, contexte: Contexte, acces: Authentifie) -> EmployeeReponse:
    return await contexte.employees.lire(session, identifiant, paie(acces))


@employees.post("/search", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def rechercher(corps: EmployeeRecherche | None, page: PageEmployees, session: Session, contexte: Contexte):
    return await contexte.employees.rechercher(session, corps, page)


@employees.post("/analytique", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def analytique(
    corps: EmployeeRecherche | None, session: Session, contexte: Contexte
) -> EmployeeAnalytiqueReponse:
    return await contexte.employees.analytique(session, corps)


@employees.post("/regroupements", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def regroupements(
    dimension: DimensionEmployes, corps: EmployeeRecherche | None, session: Session, contexte: Contexte
) -> list[EmployeeRegroupementReponse]:
    return await contexte.employees.regrouper(session, corps, dimension)


@employees.post("/sorties-mois", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def sorties_mois(
    corps: EmployeeSortiesRecherche, session: Session, contexte: Contexte
) -> EmployeeSortiesMoisReponse:
    return await contexte.employees.sorties_mois(session, corps.periode)


@employees.get("/import/modele", dependencies=[Depends(exiger("EMPLOYEE_IMPORT"))])
async def modele_import(contexte: Contexte) -> StreamingResponse:
    return StreamingResponse(
        contexte.employees.modele_import(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Modele_Import_Employes.xlsx"},
    )


@employees.post("/import", dependencies=[Depends(exiger("EMPLOYEE_IMPORT"))])
async def importer(session: Session, contexte: Contexte, file: UploadFile = File(...)) -> EmployeeImportReponse:  # noqa: B008
    return await contexte.employees.importer(session, await file.read())


@employees.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("EMPLOYEE_DELETE"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.employees.supprimer(session, identifiant)
