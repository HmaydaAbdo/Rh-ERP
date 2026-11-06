from collections.abc import Sequence

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.pagination import Pagination
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient

from .models import Fonction


async def par_id(session: AsyncSession, identifiant: int) -> Fonction | None:
    return (await session.execute(select(Fonction).where(Fonction.id == identifiant))).scalar_one_or_none()


async def existe_par_libelle(session: AsyncSession, libelle: str, sauf_id: int | None = None) -> bool:
    filtres: list[ColumnElement[bool]] = [func.lower(Fonction.libelle) == libelle.lower()]
    if sauf_id is not None:
        filtres.append(Fonction.id != sauf_id)
    return (await session.execute(select(func.count()).select_from(Fonction).where(*filtres))).scalar_one() > 0


async def rechercher(
    session: AsyncSession, libelle: str | None, pagination: Pagination
) -> tuple[Sequence[Fonction], int]:
    filtres: list[ColumnElement[bool]] = []
    if libelle and libelle.strip():
        filtres.append(func.lower(Fonction.libelle).like(motif_contient(libelle), escape=ECHAPPEMENT))
    total = (await session.execute(select(func.count()).select_from(Fonction).where(*filtres))).scalar_one()
    requete = select(Fonction).where(*filtres)
    for champ, croissant in pagination.tri:
        requete = requete.order_by(getattr(Fonction, champ).asc() if croissant else getattr(Fonction, champ).desc())
    requete = requete.order_by(Fonction.id.asc()).limit(pagination.taille).offset(pagination.decalage)
    return (await session.execute(requete)).scalars().all(), total
