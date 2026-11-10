from typing import Any, cast

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.common.pagination import Pagination
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction
from staport.domains.paie.models import Paie

from .models import HeureSupp
from .schemas import HeuresSuppRecherche

Fiche = tuple[HeureSupp, Employee, Fonction, Chantier]
FicheEquipe = tuple[HeureSupp, Employee, Fonction, Chantier, Equipe | None]

# Noms de tri du client (propriétés de l'entité côté Spring) → colonnes.
TRIS: dict[str, Any] = {
    "id": HeureSupp.id,
    "version": HeureSupp.version,
    "periode": HeureSupp.periode,
    "montant": HeureSupp.montant,
    "stcDh": HeureSupp.stc_dh,
    "forfait": HeureSupp.forfait,
    "netAPayer": HeureSupp.net_a_payer,
    "heures": HeureSupp.heures,
    "salaireHoraire": HeureSupp.salaire_horaire,
    "salaireReference": HeureSupp.salaire_reference,
    "employee.nomPrenom": Employee.nom_prenom,
    "employee.cin": Employee.cin,
    "chantier.code": Chantier.code,
    "fonction.libelle": Fonction.libelle,
}


def _base() -> Select[Any]:
    return cast(
        Select[Any],
        (
            select(HeureSupp, Employee, Fonction, Chantier)
            .join(Employee, Employee.id == HeureSupp.employee_id)
            .join(Fonction, Fonction.id == HeureSupp.fonction_id)
            .join(Chantier, Chantier.id == HeureSupp.chantier_id)
        ),
    )


def _filtrer(q: Select[Any], c: HeuresSuppRecherche) -> Select[Any]:
    f: list[ColumnElement[bool]] = []
    if c.periode is not None:
        f.append(HeureSupp.periode == c.periode)
    if c.periodes:
        f.append(HeureSupp.periode.in_(c.periodes))
    if c.chantier_ids:
        f.append(HeureSupp.chantier_id.in_(c.chantier_ids))
    if c.fonction_ids:
        f.append(HeureSupp.fonction_id.in_(c.fonction_ids))
    if c.cin and c.cin.strip():
        f.append(func.lower(Employee.cin).like(f"%{c.cin.strip().lower()}%"))
    if c.nom_prenom and c.nom_prenom.strip():
        f.append(func.lower(Employee.nom_prenom).like(f"%{c.nom_prenom.strip().lower()}%"))
    if c.equipe_ids:
        q = q.join(Paie, Paie.id == HeureSupp.paie_id)
        equipes = [identifiant for identifiant in c.equipe_ids if identifiant > 0]
        if 0 in c.equipe_ids:
            f.append(
                or_(Paie.equipe_id.in_(equipes), Paie.equipe_id.is_(None)) if equipes else Paie.equipe_id.is_(None)
            )
        else:
            f.append(Paie.equipe_id.in_(equipes))
    return q.where(*f)


async def rechercher(s: AsyncSession, c: HeuresSuppRecherche, p: Pagination) -> tuple[list[Fiche], int]:
    q = _filtrer(_base(), c)
    total = (
        await s.execute(select(func.count()).select_from(q.with_only_columns(HeureSupp.id).subquery()))
    ).scalar_one()
    for champ, croissant in p.tri:
        colonne = TRIS[champ]
        q = q.order_by(colonne.asc() if croissant else colonne.desc())
    lignes = (await s.execute(q.order_by(HeureSupp.id.asc()).limit(p.taille).offset(p.decalage))).all()
    return cast(list[Fiche], [tuple(ligne) for ligne in lignes]), total


async def lignes_analytiques(s: AsyncSession, c: HeuresSuppRecherche) -> list[FicheEquipe]:
    q = _filtrer(
        _base()
        .add_columns(Equipe)
        .join(Paie, Paie.id == HeureSupp.paie_id)
        .outerjoin(Equipe, Equipe.id == Paie.equipe_id),
        c.model_copy(update={"equipe_ids": None}),
    )
    if c.equipe_ids:
        equipes = [identifiant for identifiant in c.equipe_ids if identifiant > 0]
        if 0 in c.equipe_ids:
            q = q.where(
                or_(Paie.equipe_id.in_(equipes), Paie.equipe_id.is_(None)) if equipes else Paie.equipe_id.is_(None)
            )
        else:
            q = q.where(Paie.equipe_id.in_(equipes))
    lignes = (await s.execute(q.order_by(HeureSupp.id.asc()))).all()
    return cast(list[FicheEquipe], [tuple(ligne) for ligne in lignes])


async def fiche(s: AsyncSession, identifiant: int) -> Fiche | None:
    ligne = (await s.execute(_base().where(HeureSupp.id == identifiant))).first()
    return None if ligne is None else cast(Fiche, tuple(ligne))


async def par_id(s: AsyncSession, identifiant: int) -> HeureSupp | None:
    return (await s.execute(select(HeureSupp).where(HeureSupp.id == identifiant))).scalar_one_or_none()


async def existe(s: AsyncSession, employee_id: int, periode: int, chantier_id: int) -> bool:
    q = (
        select(func.count())
        .select_from(HeureSupp)
        .where(HeureSupp.employee_id == employee_id, HeureSupp.periode == periode, HeureSupp.chantier_id == chantier_id)
    )
    return (await s.execute(q)).scalar_one() > 0


async def forfait_sur_autre_chantier(s: AsyncSession, employee_id: int, periode: int, chantier_id: int) -> bool:
    q = (
        select(func.count())
        .select_from(HeureSupp)
        .where(
            HeureSupp.employee_id == employee_id,
            HeureSupp.periode == periode,
            HeureSupp.forfait.is_not(None),
            HeureSupp.chantier_id != chantier_id,
        )
    )
    return (await s.execute(q)).scalar_one() > 0


async def periodes(s: AsyncSession) -> list[int]:
    return list((await s.execute(select(HeureSupp.periode).distinct().order_by(HeureSupp.periode.desc()))).scalars())


async def du_mois(s: AsyncSession, periode: int) -> list[HeureSupp]:
    q = (
        select(HeureSupp)
        .join(Employee, Employee.id == HeureSupp.employee_id)
        .where(HeureSupp.periode == periode)
        .order_by(Employee.nom_prenom.asc(), HeureSupp.id.asc())
    )
    return list((await s.execute(q)).scalars().all())


async def pour_suppression(s: AsyncSession, criteres: HeuresSuppRecherche) -> list[HeureSupp]:
    q = _filtrer(select(HeureSupp).join(Employee, Employee.id == HeureSupp.employee_id), criteres)
    q = q.order_by(HeureSupp.id.asc()).with_for_update(of=HeureSupp)
    return list((await s.execute(q)).scalars().all())


async def du_bulletin(s: AsyncSession, paie_id: int) -> list[HeureSupp]:
    return list((await s.execute(select(HeureSupp).where(HeureSupp.paie_id == paie_id))).scalars().all())


async def nombre_liees(s: AsyncSession, paie_ids: list[int]) -> int:
    q = select(func.count()).select_from(HeureSupp).where(HeureSupp.paie_id.in_(paie_ids))
    return (await s.execute(q)).scalar_one()


async def paie_du_mois(s: AsyncSession, employee_id: int, periode: int) -> Paie | None:
    q = select(Paie).where(Paie.employee_id == employee_id, Paie.periode == periode)
    return (await s.execute(q)).scalar_one_or_none()


async def de_la_personne(s: AsyncSession, employee_id: int, periode: int, chantier_id: int) -> list[HeureSupp]:
    q = select(HeureSupp).where(
        HeureSupp.employee_id == employee_id, HeureSupp.periode == periode, HeureSupp.chantier_id == chantier_id
    )
    return list((await s.execute(q)).scalars().all())


async def toutes(s: AsyncSession, c: HeuresSuppRecherche, tri: tuple[tuple[str, bool], ...]) -> list[Fiche]:
    """Tout le périmètre dans le tri demandé, puis l'employé et l'identifiant (ordre stable du rapport)."""
    q = _filtrer(_base(), c)
    for champ, croissant in tri:
        colonne = TRIS[champ]
        q = q.order_by(colonne.asc() if croissant else colonne.desc())
    q = q.order_by(Employee.nom_prenom.asc(), HeureSupp.id.asc())
    return cast(list[Fiche], [tuple(ligne) for ligne in (await s.execute(q)).all()])


async def forfaits_precedents(s: AsyncSession, periode: int, chantier_id: int) -> list[tuple[HeureSupp, Employee]]:
    """Forfaits du mois le plus récent, antérieur à `periode`, qui en compte pour le chantier (stable sur le CIN)."""
    dernier = (
        select(func.max(HeureSupp.periode))
        .where(HeureSupp.chantier_id == chantier_id, HeureSupp.periode < periode, HeureSupp.forfait.is_not(None))
        .scalar_subquery()
    )
    q = (
        select(HeureSupp, Employee)
        .join(Employee, Employee.id == HeureSupp.employee_id)
        .where(HeureSupp.chantier_id == chantier_id, HeureSupp.periode == dernier, HeureSupp.forfait.is_not(None))
        .order_by(Employee.nom_prenom.asc(), HeureSupp.id.asc())
    )
    return [(ligne[0], ligne[1]) for ligne in (await s.execute(q)).all()]
