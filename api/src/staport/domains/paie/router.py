from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Contexte, exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.domains.common.schemas import Page
from staport.platform.base_de_donnees import session_requete

from .schemas import (
    PaieAnalytiqueReponse,
    PaieChantierOption,
    PaieCreationRequete,
    PaieEffectifMois,
    PaieEquipeOption,
    PaieModificationRequete,
    PaieOptionsChantierRequete,
    PaieOptionsEquipeRequete,
    PaieParcoursReponse,
    PaiePeriodeResume,
    PaieRecherche,
    PaieReponse,
    PaiesPage,
)

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


@paies.get("/periodes", dependencies=[Depends(exiger("PAIE_READ"))])
async def periodes(session: Session, contexte: Contexte) -> list[PaiePeriodeResume]:
    return await contexte.paies.periodes(session)


@paies.post("/analytique", dependencies=[Depends(exiger("PAIE_READ"))])
async def analytique(periode: int, session: Session, contexte: Contexte) -> PaieAnalytiqueReponse:
    return await contexte.paies.analytique(session, periode)


@paies.post("/options/chantiers", dependencies=[Depends(exiger("PAIE_READ"))])
async def options_chantiers(
    corps: PaieOptionsChantierRequete, page: PagePaie, session: Session, contexte: Contexte
) -> Page[PaieChantierOption]:
    return await contexte.paies.options_chantiers(session, corps, page)


@paies.post("/options/equipes", dependencies=[Depends(exiger("PAIE_READ"))])
async def options_equipes(
    corps: PaieOptionsEquipeRequete, page: PagePaie, session: Session, contexte: Contexte
) -> Page[PaieEquipeOption]:
    return await contexte.paies.options_equipes(session, corps, page)


@paies.post("/effectifs", dependencies=[Depends(exiger("PAIE_READ"))])
async def effectifs(corps: PaieRecherche | None, session: Session, contexte: Contexte) -> list[PaieEffectifMois]:
    return await contexte.paies.effectifs(session, corps or PaieRecherche())


@paies.get("/employes/{employee_id}/parcours", dependencies=[Depends(exiger("PAIE_READ"))])
async def parcours(employee_id: int, session: Session, contexte: Contexte) -> PaieParcoursReponse:
    return await contexte.paies.parcours(session, employee_id)


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
