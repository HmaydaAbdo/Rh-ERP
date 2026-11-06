from collections.abc import Sequence

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.pagination import Pagination
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient

from .models import Employee
from .schemas import EmployeeRecherche


async def par_id(s: AsyncSession, i: int) -> Employee | None:
    return (await s.execute(select(Employee).where(Employee.id == i))).scalar_one_or_none()


async def existe_cin(s: AsyncSession, cin: str, sauf_id: int | None = None) -> bool:
    q = select(func.count()).select_from(Employee).where(func.upper(func.btrim(Employee.cin)) == cin.upper().strip())
    if sauf_id is not None:
        q = q.where(Employee.id != sauf_id)
    return (await s.execute(q)).scalar_one() > 0


async def rechercher(s: AsyncSession, c: EmployeeRecherche, p: Pagination) -> tuple[Sequence[Employee], int]:
    f: list[ColumnElement[bool]] = []
    if c.nom_prenom and c.nom_prenom.strip():
        f.append(func.lower(Employee.nom_prenom).like(motif_contient(c.nom_prenom), escape=ECHAPPEMENT))
    if c.cin and c.cin.strip():
        f.append(func.lower(Employee.cin).like(motif_contient(c.cin), escape=ECHAPPEMENT))
    if c.fonction_ids:
        f.append(Employee.fonction_id.in_(c.fonction_ids))
    if c.chantier_ids:
        f.append(Employee.chantier_id.in_(c.chantier_ids))
    if c.equipe_ids:
        equipe_filtres: list[ColumnElement[bool]] = []
        if ids := [x for x in c.equipe_ids if x]:
            equipe_filtres.append(Employee.equipe_id.in_(ids))
        if 0 in c.equipe_ids:
            equipe_filtres.append(Employee.equipe_id.is_(None))
        f.append(or_(*equipe_filtres))
    if c.statut is not None:
        f.append(Employee.statut == c.statut)
    total = (await s.execute(select(func.count()).select_from(Employee).where(and_(*f)))).scalar_one()
    q = select(Employee).where(and_(*f))
    for champ, asc in p.tri:
        q = q.order_by(getattr(Employee, champ).asc() if asc else getattr(Employee, champ).desc())
    q = q.order_by(Employee.id.asc()).limit(p.taille).offset(p.decalage)
    return (await s.execute(q)).scalars().all(), total
