from typing import Any, cast

from sqlalchemy import ColumnElement, Select, case, func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from staport.domains.chantier.models import Chantier
from staport.domains.common.pagination import Pagination
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .models import Paie
from .schemas import PaieRecherche

_EMPLOYEE = aliased(Employee)
_FONCTION = aliased(Fonction)
_CHANTIER = aliased(Chantier)
_EQUIPE = aliased(Equipe)
_JOINTURES: dict[str, tuple[Any, ColumnElement[bool]]] = {
    "employee": (_EMPLOYEE, _EMPLOYEE.id == Paie.employee_id),
    "fonction": (_FONCTION, _FONCTION.id == Paie.fonction_id),
    "chantier": (_CHANTIER, _CHANTIER.id == Paie.chantier_id),
    "equipe": (_EQUIPE, _EQUIPE.id == Paie.equipe_id),
}
# Nom de tri public (celui du JSON, comme Spring Data) -> (colonne, jointure externe nécessaire ou None).
_TRIS: dict[str, tuple[Any, str | None]] = {
    "id": (Paie.id, None),
    "version": (Paie.version, None),
    "periode": (Paie.periode, None),
    "nombreJoursTravailles": (Paie.nombre_jours_travailles, None),
    "joursRecuperationOuvrable": (Paie.jours_recuperation_ouvrable, None),
    "joursRecuperationDimanche": (Paie.jours_recuperation_dimanche, None),
    "salaireMensuel": (Paie.salaire_mensuel, None),
    "primeRoulageOrdinaire": (Paie.prime_roulage_ordinaire, None),
    "primeRoulageDimanche": (Paie.prime_roulage_dimanche, None),
    "salaireTotal": (Paie.salaire_total, None),
    "observation": (Paie.observation, None),
    "employee.nomPrenom": (_EMPLOYEE.nom_prenom, "employee"),
    "employee.cin": (_EMPLOYEE.cin, "employee"),
    "fonction.libelle": (_FONCTION.libelle, "fonction"),
    "chantier.code": (_CHANTIER.code, "chantier"),
    "chantier.nom": (_CHANTIER.nom, "chantier"),
    "chantier.designation": (_CHANTIER.designation, "chantier"),
    "equipe.code": (_EQUIPE.code, "equipe"),
    "equipe.libelle": (_EQUIPE.libelle, "equipe"),
}
TRIS_PUBLICS = frozenset(_TRIS)


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


async def lignes_analytiques(
    s: AsyncSession, criteres: PaieRecherche
) -> list[tuple[Paie, Employee, Fonction, Chantier, Equipe | None]]:
    q = (
        select(Paie, Employee, Fonction, Chantier, Equipe)
        .join(Employee, Employee.id == Paie.employee_id)
        .join(Fonction, Fonction.id == Paie.fonction_id)
        .join(Chantier, Chantier.id == Paie.chantier_id)
        .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
    )
    if criteres.cin:
        q = q.where(func.lower(Employee.cin).like(f"%{criteres.cin.strip().lower()}%"))
    if criteres.nom_prenom:
        q = q.where(func.lower(Employee.nom_prenom).like(f"%{criteres.nom_prenom.strip().lower()}%"))
    if criteres.chantier_ids:
        q = q.where(Paie.chantier_id.in_(criteres.chantier_ids))
    if criteres.fonction_ids:
        q = q.where(Paie.fonction_id.in_(criteres.fonction_ids))
    if criteres.equipe_ids:
        equipes = [identifiant for identifiant in criteres.equipe_ids if identifiant != 0]
        q = q.where(
            or_(Paie.equipe_id.in_(equipes), Paie.equipe_id.is_(None))
            if 0 in criteres.equipe_ids
            else Paie.equipe_id.in_(equipes)
        )
    return cast(list[tuple[Paie, Employee, Fonction, Chantier, Equipe | None]], list((await s.execute(q)).all()))


async def existe(s: AsyncSession, employee_id: int, periode: int, sauf_id: int | None = None) -> bool:
    q = select(func.count()).select_from(Paie).where(Paie.employee_id == employee_id, Paie.periode == periode)
    if sauf_id is not None:
        q = q.where(Paie.id != sauf_id)
    return (await s.execute(q)).scalar_one() > 0


def _selection(c: PaieRecherche) -> Select[Paie]:
    """Filtre unique de la liste et de la suppression de groupe : le groupe supprimé est celui que la liste compte."""
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
    return base.where(*f)


async def couples_existants(s: AsyncSession, couples: set[tuple[int, int]]) -> int:
    """Nombre de couples (employé, mois) qui ont déjà un bulletin."""
    q = select(func.count()).select_from(Paie).where(tuple_(Paie.employee_id, Paie.periode).in_(couples))
    return (await s.execute(q)).scalar_one()


async def ids_existants(
    s: AsyncSession, modele: type[Employee | Fonction | Chantier | Equipe], ids: set[int]
) -> set[int]:
    return set((await s.execute(select(modele.id).where(modele.id.in_(ids)))).scalars())


async def groupe(s: AsyncSession, c: PaieRecherche) -> list[Paie]:
    return list((await s.execute(_selection(c).order_by(Paie.id.asc()))).scalars().all())


async def rechercher(s: AsyncSession, c: PaieRecherche, p: Pagination) -> tuple[list[Paie], int]:
    q = _selection(c)
    total = (await s.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    criteres = [(_TRIS[champ], asc) for champ, asc in p.tri]
    for jointure in dict.fromkeys(j for (_, j), _ in criteres if j):
        cible, condition = _JOINTURES[jointure]
        q = q.outerjoin(cible, condition)
    for (colonne, _), asc in criteres:
        q = q.order_by(colonne.asc() if asc else colonne.desc())
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
