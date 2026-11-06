from sqlalchemy import ColumnElement, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.pagination import Pagination

from .models import Paie
from .schemas import PaieRecherche


async def par_id(s: AsyncSession, identifiant: int) -> Paie | None:
    return (await s.execute(select(Paie).where(Paie.id == identifiant))).scalar_one_or_none()


async def existe(s: AsyncSession, employee_id: int, periode: int, sauf_id: int | None = None) -> bool:
    q = select(func.count()).select_from(Paie).where(Paie.employee_id == employee_id, Paie.periode == periode)
    if sauf_id is not None:
        q = q.where(Paie.id != sauf_id)
    return (await s.execute(q)).scalar_one() > 0


async def rechercher(s: AsyncSession, c: PaieRecherche, p: Pagination) -> tuple[list[Paie], int]:
    f: list[ColumnElement[bool]] = []
    if c.employee_id is not None:
        f.append(Paie.employee_id == c.employee_id)
    if c.periode is not None:
        f.append(Paie.periode == c.periode)
    if c.fonction_ids:
        f.append(Paie.fonction_id.in_(c.fonction_ids))
    if c.chantier_ids:
        f.append(Paie.chantier_id.in_(c.chantier_ids))
    if c.equipe_ids:
        f.append(Paie.equipe_id.in_([x for x in c.equipe_ids if x]))
    total = (await s.execute(select(func.count()).select_from(Paie).where(and_(*f)))).scalar_one()
    q = select(Paie).where(and_(*f))
    for champ, asc in p.tri:
        q = q.order_by(getattr(Paie, champ).asc() if asc else getattr(Paie, champ).desc())
    rows = (await s.execute(q.order_by(Paie.id.asc()).limit(p.taille).offset(p.decalage))).scalars().all()
    return list(rows), total
