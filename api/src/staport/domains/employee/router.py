from dataclasses import replace
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Authentifie, Contexte, exiger
from staport.domains.auth.securite import JetonAcces
from staport.domains.common.pagination import Pagination, pagination
from staport.domains.paie.periode import afficher_periode
from staport.platform.base_de_donnees import session_requete

from .import_cnss import importer_cnss
from .repository import CHAMPS_DE_PAIE, TRIS_PUBLICS
from .schemas import (
    AttestationTravailRequete,
    DimensionEmployes,
    EmployeeAnalytiqueReponse,
    EmployeeCreationRequete,
    EmployeeEntrantsMoisReponse,
    EmployeeEntrantsRecherche,
    EmployeeModificationRequete,
    EmployeeMouvementsRecherche,
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
    """Sans `PAIE_READ`, les tris sur les champs de paie sont retirés : ils feraient deviner les salaires."""
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
async def rechercher(
    page: PageEmployees,
    session: Session,
    contexte: Contexte,
    acces: Authentifie,
    corps: EmployeeRecherche | None = None,
):
    return await contexte.employees.rechercher(session, corps, page, paie(acces))


@employees.post("/analytique", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def analytique(
    session: Session, contexte: Contexte, corps: EmployeeRecherche | None = None
) -> EmployeeAnalytiqueReponse:
    return await contexte.employees.analytique(session, corps)


@employees.post("/regroupements", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def regroupements(
    dimension: DimensionEmployes, session: Session, contexte: Contexte, corps: EmployeeRecherche | None = None
) -> list[EmployeeRegroupementReponse]:
    return await contexte.employees.regrouper(session, corps, dimension)


@employees.post("/sorties-mois", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def sorties_mois(
    corps: EmployeeSortiesRecherche, session: Session, contexte: Contexte, acces: Authentifie
) -> EmployeeSortiesMoisReponse:
    return await contexte.employees.sorties_mois(session, corps.periode, avec_paie=paie(acces), filtres=corps)


@employees.post("/entrants-mois", dependencies=[Depends(exiger("EMPLOYEE_READ"))])
async def entrants_mois(
    corps: EmployeeEntrantsRecherche, session: Session, contexte: Contexte, acces: Authentifie
) -> EmployeeEntrantsMoisReponse:
    return await contexte.employees.entrants_mois(session, corps.periode, avec_paie=paie(acces), filtres=corps)


def _pdf(contenu: bytes, nom: str) -> Response:
    return Response(
        contenu, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={nom}"}
    )


@employees.post("/sorties-mois/pdf", dependencies=[Depends(exiger("EMPLOYEE_EXPORT"))])
async def sorties_mois_pdf(
    corps: EmployeeSortiesRecherche, session: Session, contexte: Contexte, acces: Authentifie
) -> Response:
    contenu = await contexte.mouvements_pdf.generer(session, sorties=corps, avec_paie=paie(acces))
    return _pdf(contenu, f"Sortants_{afficher_periode(corps.periode)}.pdf")


@employees.post("/entrants-mois/pdf", dependencies=[Depends(exiger("EMPLOYEE_EXPORT"))])
async def entrants_mois_pdf(
    corps: EmployeeEntrantsRecherche, session: Session, contexte: Contexte, acces: Authentifie
) -> Response:
    contenu = await contexte.mouvements_pdf.generer(session, entrants=corps, avec_paie=paie(acces))
    return _pdf(contenu, f"Entrants_{afficher_periode(corps.periode)}.pdf")


@employees.post("/mouvements-mois/pdf", dependencies=[Depends(exiger("EMPLOYEE_EXPORT"))])
async def mouvements_mois_pdf(
    corps: EmployeeMouvementsRecherche, session: Session, contexte: Contexte, acces: Authentifie
) -> Response:
    commun = corps.model_dump()
    contenu = await contexte.mouvements_pdf.generer(
        session,
        sorties=EmployeeSortiesRecherche.model_validate(commun),
        entrants=EmployeeEntrantsRecherche.model_validate(commun),
        avec_paie=paie(acces),
    )
    return _pdf(contenu, f"Mouvements_{afficher_periode(corps.periode)}.pdf")


@employees.get("/import/modele", dependencies=[Depends(exiger("EMPLOYEE_IMPORT"))])
async def modele_import(contexte: Contexte) -> StreamingResponse:
    return StreamingResponse(
        contexte.employees.modele_import(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Modele_Import_Employes.xlsx"},
    )


@employees.post("/import", dependencies=[Depends(exiger("EMPLOYEE_IMPORT"))], response_model=None)
async def importer(session: Session, contexte: Contexte, file: UploadFile = File(...)) -> JSONResponse:  # noqa: B008
    """Import atomique : une ligne rejetée refuse tout le fichier (HTTP 400, rapport dans le corps)."""
    resultat = await contexte.employees.importer(session, await file.read())
    statut = status.HTTP_400_BAD_REQUEST if resultat.ignores > 0 else status.HTTP_200_OK
    return JSONResponse(resultat.model_dump(by_alias=True, mode="json"), status_code=statut)


@employees.post("/import/cnss", dependencies=[Depends(exiger("EMPLOYEE_IMPORT"))], response_model=None)
async def importer_declarations_cnss(
    session: Session,
    contexte: Contexte,
    file: UploadFile = File(...),  # noqa: B008
) -> JSONResponse:
    """Déclarations CNSS (matricule, date) par CIN : atomique, une ligne rejetée refuse tout le fichier (HTTP 400)."""
    resultat = await importer_cnss(contexte.audit, session, file.filename, await file.read())
    statut = status.HTTP_400_BAD_REQUEST if resultat.ignores > 0 else status.HTTP_200_OK
    return JSONResponse(resultat.model_dump(by_alias=True, mode="json"), status_code=statut)


@employees.post("/{identifiant}/attestation-travail", dependencies=[Depends(exiger("DOCUMENT_ADMIN_EDITER"))])
async def attestation_travail(
    identifiant: int, corps: AttestationTravailRequete, session: Session, contexte: Contexte
) -> Response:
    """Attestation de travail d'un employé en poste et déclaré à la CNSS, en PDF ou en Word ; la civilité choisie reste
    sur la fiche."""
    document = await contexte.attestations.generer(session, identifiant, corps.civilite, corps.format, date.today())
    return Response(
        document.contenu,
        media_type=document.type_mime,
        headers={"Content-Disposition": f"attachment; filename={document.nom}"},
    )


@employees.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("EMPLOYEE_DELETE"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.employees.supprimer(session, identifiant)
