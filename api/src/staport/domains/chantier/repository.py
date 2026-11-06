from collections.abc import Sequence

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.pagination import Pagination
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient

from .models import Chantier
from .schemas import ChantierRecherche


async def par_id(session: AsyncSession, identifiant: int) -> Chantier | None:
    return (await session.execute(select(Chantier).where(Chantier.id == identifiant))).scalar_one_or_none()


async def existe_code(session: AsyncSession, code: str, sauf_id: int | None = None) -> bool:
    q = select(func.count()).select_from(Chantier).where(func.upper(func.btrim(Chantier.code)) == code.upper().strip())
    if sauf_id is not None:
        q = q.where(Chantier.id != sauf_id)
    return (await session.execute(q)).scalar_one() > 0


async def rechercher(
    session: AsyncSession, criteres: ChantierRecherche, page: Pagination
) -> tuple[Sequence[Chantier], int]:
    filtres: list[ColumnElement[bool]] = []
    if criteres.code and criteres.code.strip():
        filtres.append(func.lower(Chantier.code).like(motif_contient(criteres.code), escape=ECHAPPEMENT))
    if criteres.designation and criteres.designation.strip():
        filtres.append(func.lower(Chantier.designation).like(motif_contient(criteres.designation), escape=ECHAPPEMENT))
    if criteres.recherche and criteres.recherche.strip():
        m = motif_contient(criteres.recherche)
        filtres.append(
            or_(
                func.lower(Chantier.code).like(m, escape=ECHAPPEMENT),
                func.lower(Chantier.nom).like(m, escape=ECHAPPEMENT),
                func.lower(Chantier.designation).like(m, escape=ECHAPPEMENT),
            )
        )
    if criteres.actif is not None:
        filtres.append(Chantier.actif == criteres.actif)
    total = (await session.execute(select(func.count()).select_from(Chantier).where(and_(*filtres)))).scalar_one()
    q = select(Chantier).where(and_(*filtres))
    for champ, asc in page.tri:
        q = q.order_by(getattr(Chantier, champ).asc() if asc else getattr(Chantier, champ).desc())
    q = q.order_by(Chantier.id.asc()).limit(page.taille).offset(page.decalage)
    return (await session.execute(q)).scalars().all(), total


async def carte(session: AsyncSession) -> Sequence[Chantier]:
    return (
        (
            await session.execute(
                select(Chantier).where(Chantier.afficher_sur_carte.is_(True)).order_by(Chantier.code.asc())
            )
        )
        .scalars()
        .all()
    )
