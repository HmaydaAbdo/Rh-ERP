from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.platform.base_de_donnees import session_requete

from .schemas import (
    FonctionCreationRequete,
    FonctionModificationRequete,
    FonctionRecherche,
    FonctionReponse,
)

Session = Annotated[AsyncSession, Depends(session_requete)]
PageFonctions = Annotated[Pagination, Depends(pagination("libelle", frozenset({"id", "libelle", "version"})))]
fonctions = APIRouter(prefix="/functions", tags=["Fonctions"])


@fonctions.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(exiger("FUNCTION_WRITE"))])
async def creer(corps: FonctionCreationRequete, session: Session, contexte: Contexte) -> FonctionReponse:
    return await contexte.fonctions.creer(session, corps)


@fonctions.put("/{identifiant}", dependencies=[Depends(exiger("FUNCTION_WRITE"))])
async def modifier(
    identifiant: int, corps: FonctionModificationRequete, session: Session, contexte: Contexte
) -> FonctionReponse:
    return await contexte.fonctions.modifier(session, identifiant, corps)


@fonctions.get("/{identifiant}", dependencies=[Depends(exiger("FUNCTION_READ"))])
async def lire(identifiant: int, session: Session, contexte: Contexte) -> FonctionReponse:
    return await contexte.fonctions.lire(session, identifiant)


@fonctions.post("/search", dependencies=[Depends(exiger("FUNCTION_READ"))])
async def rechercher(corps: FonctionRecherche | None, page: PageFonctions, session: Session, contexte: Contexte):
    return await contexte.fonctions.rechercher(session, corps, page)


@fonctions.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("FUNCTION_DELETE"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.fonctions.supprimer(session, identifiant)


@fonctions.post("/import", dependencies=[Depends(exiger("FUNCTION_IMPORT"))], response_model=None)
async def importer(session: Session, contexte: Contexte, file: UploadFile = File(...)) -> JSONResponse:  # noqa: B008
    """Import atomique : une ligne rejetée refuse tout le fichier (HTTP 400, rapport dans le corps)."""
    resultat = await contexte.fonctions.importer(session, file.filename, await file.read())
    statut = status.HTTP_400_BAD_REQUEST if resultat.ignores > 0 else status.HTTP_200_OK
    return JSONResponse(resultat.model_dump(by_alias=True, mode="json"), status_code=statut)


@fonctions.get("/import/modele", dependencies=[Depends(exiger("FUNCTION_IMPORT"))])
async def modele_import(contexte: Contexte) -> StreamingResponse:
    return StreamingResponse(
        contexte.fonctions.modele_import(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Modele_Import_Fonctions.xlsx"},
    )
