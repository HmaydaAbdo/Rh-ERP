from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.platform.base_de_donnees import session_requete

from .schemas import (
    EquipeCreationRequete,
    EquipeModificationRequete,
    EquipeRecherche,
    EquipeReponse,
)

Session = Annotated[AsyncSession, Depends(session_requete)]
PageEquipes = Annotated[Pagination, Depends(pagination("code", frozenset({"id", "code", "libelle", "version"})))]
equipes = APIRouter(prefix="/equipes", tags=["Équipes"])


@equipes.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(exiger("EQUIPE_WRITE"))])
async def creer(corps: EquipeCreationRequete, session: Session, contexte: Contexte) -> EquipeReponse:
    return await contexte.equipes.creer(session, corps)


@equipes.put("/{identifiant}", dependencies=[Depends(exiger("EQUIPE_WRITE"))])
async def modifier(
    identifiant: int, corps: EquipeModificationRequete, session: Session, contexte: Contexte
) -> EquipeReponse:
    return await contexte.equipes.modifier(session, identifiant, corps)


@equipes.get("/{identifiant}", dependencies=[Depends(exiger("EQUIPE_READ"))])
async def lire(identifiant: int, session: Session, contexte: Contexte) -> EquipeReponse:
    return await contexte.equipes.lire(session, identifiant)


@equipes.post("/search", dependencies=[Depends(exiger("EQUIPE_READ"))])
async def rechercher(page: PageEquipes, session: Session, contexte: Contexte, corps: EquipeRecherche | None = None):
    return await contexte.equipes.rechercher(session, corps, page)


@equipes.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("EQUIPE_DELETE"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.equipes.supprimer(session, identifiant)


@equipes.post("/import", dependencies=[Depends(exiger("EQUIPE_IMPORT"))], response_model=None)
async def importer(session: Session, contexte: Contexte, file: UploadFile = File(...)) -> JSONResponse:  # noqa: B008
    """Import atomique : une ligne rejetée refuse tout le fichier (HTTP 400, rapport dans le corps)."""
    resultat = await contexte.equipes.importer(session, file.filename, await file.read())
    statut = status.HTTP_400_BAD_REQUEST if resultat.ignores > 0 else status.HTTP_200_OK
    return JSONResponse(resultat.model_dump(by_alias=True, mode="json"), status_code=statut)


@equipes.get("/import/modele", dependencies=[Depends(exiger("EQUIPE_IMPORT"))])
async def modele_import(contexte: Contexte) -> StreamingResponse:
    return StreamingResponse(
        contexte.equipes.modele_import(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Modele_Import_Equipes.xlsx"},
    )
