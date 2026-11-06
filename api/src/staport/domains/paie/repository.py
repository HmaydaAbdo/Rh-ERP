from typing import cast

from sqlalchemy import ColumnElement, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.pagination import Pagination
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .models import Paie
from .schemas import PaieRecherche


async def par_id(s: AsyncSession, identifiant: int) -> Paie | None:
    return (await s.execute(select(Paie).where(Paie.id == identifiant))).scalar_one_or_none()


async def fiches(s: AsyncSession, paies: list[Paie]) -> list[tuple[Paie, Employee, Fonction, Chantier, Equipe | None]]:
    if not paies:
        return []
    q = (
        select(Paie, Employee, Fonction, Chantier, Equipe)
        .join(Employee, Employee.id == Paie.employee_id)
        .join(Fonction, Fonction.id == Paie.fonction_id)
        .join(Chantier, Chantier.id == Paie.chantier_id)
        .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
        .where(Paie.id.in_([paie.id for paie in paies]))
    )
    return cast(list[tuple[Paie, Employee, Fonction, Chantier, Equipe | None]], list((await s.execute(q)).all()))


async def existe(s: AsyncSession, employee_id: int, periode: int, sauf_id: int | None = None) -> bool:
    q = select(func.count()).select_from(Paie).where(Paie.employee_id == employee_id, Paie.periode == periode)
    if sauf_id is not None:
        q = q.where(Paie.id != sauf_id)
    return (await s.execute(q)).scalar_one() > 0


async def rechercher(s: AsyncSession, c: PaieRecherche, p: Pagination) -> tuple[list[Paie], int]:
    f: list[ColumnElement[bool]] = []
    base = select(Paie)
    if c.cin or c.nom_prenom:
        base = base.join(Employee, Employee.id == Paie.employee_id)
    if c.cin:
        f.append(func.lower(Employee.cin).like(f"%{c.cin.strip().lower()}%"))
    if c.nom_prenom:
        f.append(func.lower(Employee.nom_prenom).like(f"%{c.nom_prenom.strip().lower()}%"))
    if c.employee_id is not None:
        f.append(Paie.employee_id == c.employee_id)
    if c.periode is not None:
        f.append(Paie.periode == c.periode)
    if c.fonction_ids:
        f.append(Paie.fonction_id.in_(c.fonction_ids))
    if c.chantier_ids:
        f.append(Paie.chantier_id.in_(c.chantier_ids))
    if c.equipe_ids:
        equipes = [x for x in c.equipe_ids if x != 0]
        if 0 in c.equipe_ids:
            f.append(or_(Paie.equipe_id.in_(equipes), Paie.equipe_id.is_(None)))
        else:
            f.append(Paie.equipe_id.in_(equipes))
    q = base.where(*f)
    total = (await s.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    for champ, asc in p.tri:
        q = q.order_by(getattr(Paie, champ).asc() if asc else getattr(Paie, champ).desc())
    rows = (await s.execute(q.order_by(Paie.id.asc()).limit(p.taille).offset(p.decalage))).scalars().all()
    return list(rows), total


async def periodes(s: AsyncSession) -> list[tuple[int, int, int, object, int, object]]:
    sortie = func.lower(func.btrim(Paie.observation)).in_(("stc", "sortie"))
    q = (
        select(
            Paie.periode,
            func.count(Paie.id),
            func.count(func.distinct(Paie.chantier_id)),
            func.coalesce(func.sum(Paie.salaire_total), 0),
            func.sum(case((sortie, 1), else_=0)),
            func.coalesce(func.sum(case((sortie, Paie.salaire_total), else_=0)), 0),
        )
        .group_by(Paie.periode)
        .order_by(Paie.periode.desc())
    )
    return list((await s.execute(q)).all())


async def analytique(s: AsyncSession, periode: int) -> tuple[int, object, object, int]:
    q = select(
        func.count(Paie.id),
        func.coalesce(func.sum(Paie.salaire_total), 0),
        func.avg(Paie.salaire_total),
        func.count(func.distinct(Paie.employee_id)),
    ).where(Paie.periode == periode)
    row = (await s.execute(q)).one()
    return row[0], row[1], row[2], row[3]


async def options_chantiers(s: AsyncSession, periode: int, recherche: str | None, p: Pagination):
    q = select(Chantier).join(Paie, Paie.chantier_id == Chantier.id).where(Paie.periode == periode).distinct()
    if recherche and recherche.strip():
        motif = f"%{recherche.strip().lower()}%"
        q = q.where(func.lower(Chantier.code).like(motif) | func.lower(func.coalesce(Chantier.nom, "")).like(motif))
    total = (await s.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    for champ, asc in p.tri:
        colonne = getattr(Chantier, champ)
        q = q.order_by(colonne.asc() if asc else colonne.desc())
    q = q.order_by(Chantier.id.asc()).limit(p.taille).offset(p.decalage)
    return list((await s.execute(q)).scalars().all()), total


async def options_equipes(s: AsyncSession, periode: int, chantier_ids: list[int], recherche: str | None, p: Pagination):
    q = (
        select(Equipe)
        .join(Paie, Paie.equipe_id == Equipe.id)
        .where(Paie.periode == periode, Paie.chantier_id.in_(chantier_ids), Paie.equipe_id.is_not(None))
        .distinct()
    )
    if recherche and recherche.strip():
        motif = f"%{recherche.strip().lower()}%"
        q = q.where(func.lower(Equipe.code).like(motif) | func.lower(Equipe.libelle).like(motif))
    total = (await s.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    for champ, asc in p.tri:
        colonne = getattr(Equipe, champ)
        q = q.order_by(colonne.asc() if asc else colonne.desc())
    q = q.order_by(Equipe.id.asc()).limit(p.taille).offset(p.decalage)
    return list((await s.execute(q)).scalars().all()), total


async def effectifs(s: AsyncSession, c: PaieRecherche) -> list[tuple[int, int]]:
    q = select(Paie.periode, func.count(func.distinct(Paie.employee_id))).join(
        Employee, Employee.id == Paie.employee_id
    )
    if c.chantier_ids:
        q = q.where(Paie.chantier_id.in_(c.chantier_ids))
    if c.fonction_ids:
        q = q.where(Paie.fonction_id.in_(c.fonction_ids))
    if c.equipe_ids:
        equipes = [x for x in c.equipe_ids if x != 0]
        q = q.where(
            or_(Paie.equipe_id.in_(equipes), Paie.equipe_id.is_(None))
            if 0 in c.equipe_ids
            else Paie.equipe_id.in_(equipes)
        )
    if c.nom_prenom:
        q = q.where(func.lower(Employee.nom_prenom).like(f"%{c.nom_prenom.strip().lower()}%"))
    if c.cin:
        q = q.where(func.lower(Employee.cin).like(f"%{c.cin.strip().lower()}%"))
    return list((await s.execute(q.group_by(Paie.periode).order_by(Paie.periode.asc()))).all())


async def parcours(s: AsyncSession, employee_id: int) -> list[Paie]:
    return list(
        (await s.execute(select(Paie).where(Paie.employee_id == employee_id).order_by(Paie.periode.asc())))
        .scalars()
        .all()
    )
