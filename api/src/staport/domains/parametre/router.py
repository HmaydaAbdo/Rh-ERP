"""Routes HTTP du domaine parametre : mêmes chemins, statuts et permissions que Spring (2 routes)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.parametre.schemas import ParametreModificationRequete, ParametreReponse
from staport.platform.base_de_donnees import session_requete

Session = Annotated[AsyncSession, Depends(session_requete)]

parametres = APIRouter(prefix="/parametres", tags=["Paramètres"])


@parametres.get(
    "", summary="Lister les paramètres et leurs valeurs courantes", dependencies=[Depends(exiger("PARAMETRE_READ"))]
)
async def lister_parametres(session: Session, contexte: Contexte) -> list[ParametreReponse]:
    return await contexte.parametres.lister(session)


@parametres.put(
    "/{identifiant}", summary="Modifier la valeur d'un paramètre", dependencies=[Depends(exiger("PARAMETRE_WRITE"))]
)
async def modifier_parametre(
    identifiant: int, corps: ParametreModificationRequete, session: Session, contexte: Contexte
) -> ParametreReponse:
    return await contexte.parametres.modifier(session, identifiant, corps)
