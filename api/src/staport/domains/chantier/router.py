import os
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.platform.base_de_donnees import session_requete

from .repository import TRIS_PUBLICS
from .schemas import (
    ChantierCreationRequete,
    ChantierModificationRequete,
    ChantierRecherche,
    ChantierReponse,
    ChantierStatutRequete,
)

Session = Annotated[AsyncSession, Depends(session_requete)]
PageChantiers = Annotated[Pagination, Depends(pagination("code", TRIS_PUBLICS))]
chantiers = APIRouter(prefix="/chantiers", tags=["Chantiers"])


@chantiers.post("/sync", dependencies=[Depends(exiger("CHANTIER_SYNC"))])
async def synchroniser(session: Session, contexte: Contexte):
    base_url = os.environ.get("CHANTIER_SYNC_BASE_URL")
    if not base_url:
        from fastapi import HTTPException

        raise HTTPException(status_code=503, detail="CHANTIER_SYNC_BASE_URL non configurée")
    return await contexte.chantiers.synchroniser(session, base_url)


@chantiers.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(exiger("CHANTIER_WRITE"))])
async def creer(corps: ChantierCreationRequete, session: Session, contexte: Contexte) -> ChantierReponse:
    return await contexte.chantiers.creer(session, corps)


@chantiers.put("/{identifiant}", dependencies=[Depends(exiger("CHANTIER_WRITE"))])
async def modifier(
    identifiant: int, corps: ChantierModificationRequete, session: Session, contexte: Contexte
) -> ChantierReponse:
    return await contexte.chantiers.modifier(session, identifiant, corps)


@chantiers.put("/{identifiant}/statut", dependencies=[Depends(exiger("CHANTIER_WRITE"))])
async def statut(
    identifiant: int, corps: ChantierStatutRequete, session: Session, contexte: Contexte
) -> ChantierReponse:
    return await contexte.chantiers.statut(session, identifiant, corps)


@chantiers.get("/carte", dependencies=[Depends(exiger("CARTE_READ"))])
async def carte(session: Session, contexte: Contexte):
    return await contexte.chantiers.carte(session)


@chantiers.get("/{identifiant}", dependencies=[Depends(exiger("CHANTIER_READ"))])
async def lire(identifiant: int, session: Session, contexte: Contexte) -> ChantierReponse:
    return await contexte.chantiers.lire(session, identifiant)


@chantiers.post("/search", dependencies=[Depends(exiger("CHANTIER_READ"))])
async def rechercher(page: PageChantiers, session: Session, contexte: Contexte, corps: ChantierRecherche | None = None):
    return await contexte.chantiers.rechercher(session, corps, page)


@chantiers.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("CHANTIER_DELETE"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.chantiers.supprimer(session, identifiant)
