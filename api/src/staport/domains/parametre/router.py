"""Routes HTTP du domaine parametre : chemins, statuts et permissions (3 routes)."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.parametre.schemas import (
    OuvertureVueLibreRequete,
    ParametreModificationRequete,
    ParametreReponse,
)
from staport.platform.base_de_donnees import session_requete

Session = Annotated[AsyncSession, Depends(session_requete)]

parametres = APIRouter(prefix="/parametres", tags=["Paramètres"])


@parametres.get(
    "", summary="Lister les paramètres et leurs valeurs courantes", dependencies=[Depends(exiger("PARAMETRE_READ"))]
)
async def lister_parametres(session: Session, contexte: Contexte) -> list[ParametreReponse]:
    return await contexte.parametres.lister(session)


@parametres.post(
    "/vues-libres/ouvertures",
    summary="Inscrire au journal l'ouverture d'une vue libre de l'assistant",
    status_code=204,
    dependencies=[Depends(exiger("IA_UTILISER"))],
)
async def enregistrer_ouverture_vue_libre(
    corps: OuvertureVueLibreRequete, session: Session, contexte: Contexte
) -> None:
    await contexte.parametres.enregistrer_ouverture_vue_libre(session, corps)


@parametres.put(
    "/{identifiant}", summary="Modifier la valeur d'un paramètre", dependencies=[Depends(exiger("PARAMETRE_WRITE"))]
)
async def modifier_parametre(
    identifiant: int, corps: ParametreModificationRequete, session: Session, contexte: Contexte
) -> ParametreReponse:
    return await contexte.parametres.modifier(session, identifiant, corps)
