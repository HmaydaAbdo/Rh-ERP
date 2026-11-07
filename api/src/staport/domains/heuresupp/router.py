from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.domains.common.schemas import Page
from staport.domains.paie.periode import PeriodePaie
from staport.platform.base_de_donnees import session_requete

from .repository import TRIS
from .schemas import (
    HeuresSuppAnalytique,
    HeuresSuppCreationRequete,
    HeuresSuppModificationRequete,
    HeuresSuppRecherche,
    HeuresSuppSuppressionMois,
    HeureSuppReponse,
)

Session = Annotated[AsyncSession, Depends(session_requete)]
PageHeures = Annotated[Pagination, Depends(pagination("periode", frozenset(TRIS)))]
heures_supp = APIRouter(prefix="/heures-supp", tags=["Heures supplémentaires"])

LECTURE = (Depends(exiger("HEURES_SUP_READ")), Depends(exiger("PAIE_READ")))


@heures_supp.post("/search", dependencies=list(LECTURE))
async def rechercher(
    corps: HeuresSuppRecherche | None, page: PageHeures, session: Session, contexte: Contexte
) -> Page[HeureSuppReponse]:
    return await contexte.heures_supp.rechercher(session, corps, page)


@heures_supp.get("/periodes", dependencies=list(LECTURE))
async def periodes(session: Session, contexte: Contexte) -> list[PeriodePaie]:
    return await contexte.heures_supp.periodes(session)


@heures_supp.get("/{identifiant}", dependencies=list(LECTURE))
async def lire(identifiant: int, session: Session, contexte: Contexte) -> HeureSuppReponse:
    return await contexte.heures_supp.lire(session, identifiant)


@heures_supp.post("/analytique", dependencies=list(LECTURE))
async def analyser(corps: HeuresSuppRecherche | None, session: Session, contexte: Contexte) -> HeuresSuppAnalytique:
    return await contexte.heures_supp.analyser(session, corps)


@heures_supp.put("/{identifiant}", dependencies=[Depends(exiger("HEURES_SUP_IMPORT")), Depends(exiger("PAIE_READ"))])
async def modifier(
    identifiant: int, corps: HeuresSuppModificationRequete, session: Session, contexte: Contexte
) -> HeureSuppReponse:
    return await contexte.heures_supp.modifier(session, identifiant, corps)


@heures_supp.post(
    "",
    dependencies=[
        Depends(exiger("HEURES_SUP_IMPORT")),
        Depends(exiger("PAIE_READ")),
        Depends(exiger("EMPLOYEE_READ")),
        Depends(exiger("CHANTIER_READ")),
    ],
)
async def creer(corps: HeuresSuppCreationRequete, session: Session, contexte: Contexte) -> HeureSuppReponse:
    return await contexte.heures_supp.creer(session, corps)


@heures_supp.delete(
    "/{identifiant}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(exiger("HEURES_SUP_DELETE")), Depends(exiger("PAIE_READ"))],
)
async def supprimer(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.heures_supp.supprimer(session, identifiant)


@heures_supp.post("/suppression-mois", dependencies=[Depends(exiger("HEURES_SUP_PURGE")), Depends(exiger("PAIE_READ"))])
async def supprimer_mois(corps: HeuresSuppSuppressionMois, session: Session, contexte: Contexte) -> int:
    return await contexte.heures_supp.supprimer_mois(session, corps.periode, corps.nombre_attendu)
