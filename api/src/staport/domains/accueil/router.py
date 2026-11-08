from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Authentifie, Contexte, exiger
from staport.platform.base_de_donnees import session_requete

from .schemas import AccueilModificationRequete, AccueilReponse

Session = Annotated[AsyncSession, Depends(session_requete)]
accueil = APIRouter(prefix="/accueil", tags=["Accueil"])


@accueil.get("", dependencies=[Depends(exiger("ACCUEIL_READ"))])
async def lire(acces: Authentifie, session: Session, contexte: Contexte) -> AccueilReponse:
    return await contexte.accueil.lire(session, acces.utilisateur_id)


@accueil.put("", dependencies=[Depends(exiger("ACCUEIL_WRITE"))])
async def enregistrer(
    corps: AccueilModificationRequete, acces: Authentifie, session: Session, contexte: Contexte
) -> AccueilReponse:
    return await contexte.accueil.enregistrer(session, acces.utilisateur_id, corps)


@accueil.delete("", dependencies=[Depends(exiger("ACCUEIL_WRITE"))])
async def reinitialiser(acces: Authentifie, session: Session, contexte: Contexte) -> AccueilReponse:
    return await contexte.accueil.reinitialiser(session, acces.utilisateur_id)


@accueil.get("/utilisateurs/{identifiant}", dependencies=[Depends(exiger("ACCUEIL_ADMIN"))])
async def lire_de(identifiant: int, session: Session, contexte: Contexte) -> AccueilReponse:
    return await contexte.accueil.lire(session, identifiant)


@accueil.put("/utilisateurs/{identifiant}", dependencies=[Depends(exiger("ACCUEIL_ADMIN"))])
async def enregistrer_de(
    identifiant: int, corps: AccueilModificationRequete, session: Session, contexte: Contexte
) -> AccueilReponse:
    return await contexte.accueil.enregistrer(session, identifiant, corps)


@accueil.delete("/utilisateurs/{identifiant}", dependencies=[Depends(exiger("ACCUEIL_ADMIN"))])
async def reinitialiser_de(identifiant: int, session: Session, contexte: Contexte) -> AccueilReponse:
    return await contexte.accueil.reinitialiser(session, identifiant)
