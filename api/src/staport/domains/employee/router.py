from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Authentifie, Contexte, exiger
from staport.domains.auth.securite import JetonAcces
from staport.domains.common.pagination import Pagination, pagination
from staport.platform.base_de_donnees import session_requete

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
)

Session = Annotated[AsyncSession, Depends(session_requete)]
PageEmployees = Annotated[
    Pagination,
    Depends(
        pagination("nom_prenom", frozenset({"nom_prenom", "cin", "date_embauche", "salaire", "statut", "version"}))
    ),
]
employees = APIRouter(prefix="/employees", tags=["Employés"])


def paie(acces: JetonAcces) -> bool:
    return "PAIE_READ" in acces.permissions or "PAIE_READ" in acces.roles


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
async def sorties_mois(periode: int, session: Session, contexte: Contexte) -> EmployeeSortiesMoisReponse:
    return await contexte.employees.sorties_mois(session, periode)


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
