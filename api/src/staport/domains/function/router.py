from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.platform.base_de_donnees import session_requete

from .schemas import FonctionCreationRequete, FonctionModificationRequete, FonctionRecherche, FonctionReponse

Session = Annotated[AsyncSession, Depends(session_requete)]
PageFonctions = Annotated[Pagination, Depends(pagination("libelle", frozenset({"libelle", "version"})))]
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
