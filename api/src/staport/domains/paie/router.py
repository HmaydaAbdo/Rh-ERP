from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.platform.base_de_donnees import session_requete

from .schemas import PaieCreationRequete, PaieModificationRequete, PaieRecherche, PaieReponse, PaiesPage

Session = Annotated[AsyncSession, Depends(session_requete)]
PagePaie = Annotated[
    Pagination, Depends(pagination("periode", frozenset({"periode", "salaire_total", "id", "version"})))
]
paies = APIRouter(prefix="/paie", tags=["Paie"])


@paies.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exiger("PAIE_WRITE"))],
)
async def creer(corps: PaieCreationRequete, session: Session, contexte: Contexte) -> PaieReponse:
    return await contexte.paies.creer(session, corps)


@paies.put("/{identifiant}", dependencies=[Depends(exiger("PAIE_WRITE"))])
async def modifier(
    identifiant: int, corps: PaieModificationRequete, session: Session, contexte: Contexte
) -> PaieReponse:
    return await contexte.paies.modifier(session, identifiant, corps)


@paies.get("/{identifiant}", dependencies=[Depends(exiger("PAIE_READ"))])
async def lire(identifiant: int, session: Session, contexte: Contexte) -> PaieReponse:
    return await contexte.paies.lire(session, identifiant)


@paies.post("/search", dependencies=[Depends(exiger("PAIE_READ"))], response_model=PaiesPage)
async def rechercher(corps: PaieRecherche | None, page: PagePaie, session: Session, contexte: Contexte) -> PaiesPage:
    return await contexte.paies.rechercher(session, corps, page)


@paies.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("PAIE_DELETE"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.paies.supprimer(session, identifiant)
