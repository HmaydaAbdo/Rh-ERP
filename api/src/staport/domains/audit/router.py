"""Consultation du journal d'audit — lecture seule, réservée à `AUDIT_READ` : l'audit contient des données personnelles
et des montants. Aucune route de modification ni de suppression."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.audit import consultation
from staport.domains.audit.schemas import Changement, EntreeJournalReponse, LigneJournal, RechercheJournal, Version
from staport.domains.auth.dependencies import exiger
from staport.domains.common.pagination import Pagination, pagination
from staport.domains.common.schemas import Page
from staport.platform.base_de_donnees import session_requete

Session = Annotated[AsyncSession, Depends(session_requete)]

logs = APIRouter(prefix="/logs", tags=["Audit"], dependencies=[Depends(exiger("AUDIT_READ"))])

PaginationJournal = Annotated[
    Pagination, Depends(pagination("horodatage,desc", frozenset(consultation.COLONNES_TRIABLES)))
]
PaginationSimple = Annotated[Pagination, Depends(pagination("id", frozenset({"id"})))]


@logs.post("/search", summary="Rechercher dans le journal d'audit")
async def rechercher(
    session: Session, pagination: PaginationJournal, criteres: RechercheJournal | None = None
) -> Page[LigneJournal]:
    async with session.begin():
        return await consultation.rechercher(session, criteres, pagination)


@logs.get("/historique/{entite}/{identifiant}", summary="Toutes les versions d'un enregistrement")
async def historique(entite: str, identifiant: int, session: Session, pagination: PaginationSimple) -> Page[Version]:
    async with session.begin():
        return await consultation.historique(session, entite, identifiant, pagination)


@logs.get("/{identifiant}", summary="Consulter une entrée du journal, avec son contexte et son périmètre")
async def lire(identifiant: int, session: Session) -> EntreeJournalReponse:
    async with session.begin():
        return await consultation.lire(session, identifiant)


@logs.get("/{identifiant}/details", summary="Ce que l'opération d'une entrée a changé, champ par champ")
async def details(identifiant: int, session: Session, pagination: PaginationSimple) -> Page[Changement]:
    async with session.begin():
        return await consultation.details(session, identifiant, pagination)
