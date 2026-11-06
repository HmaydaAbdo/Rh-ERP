from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.platform.base_de_donnees import session_requete

from .schemas import EquipeCreationRequete, EquipeModificationRequete, EquipeRecherche, EquipeReponse

Session = Annotated[AsyncSession, Depends(session_requete)]
PageEquipes = Annotated[Pagination, Depends(pagination("code", frozenset({"code", "libelle", "version"})))]
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
async def rechercher(corps: EquipeRecherche | None, page: PageEquipes, session: Session, contexte: Contexte):
    return await contexte.equipes.rechercher(session, corps, page)


@equipes.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("EQUIPE_DELETE"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.equipes.supprimer(session, identifiant)
