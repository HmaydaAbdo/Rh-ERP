"""Parcours d'un employé et tendances des effectifs, déduits des bulletins et des départs (parité Spring, ADR 0010).

Rien n'est recopié dans une table d'historique : les bulletins sont les instantanés du mois, `employe_sortie` porte les
départs. Les requêtes sont en lot (une par table) ; le calcul est pur et se teste sans base.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.chantier.models import Chantier
from staport.domains.employee.models import Employee, EmployeeSortie
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .models import Paie
from .periode import mois_precedent
from .schemas import PaieEffectifMois, PaieParcoursEvenement, PaieParcoursMois, PaieRecherche

# Rang des types dans l'énumération Spring `TypeEvenement` ; le tri les prend en ordre inverse.
_RANG_TYPE = {
    "ENTREE": 0,
    "CHANGEMENT_CHANTIER": 1,
    "CHANGEMENT_FONCTION": 2,
    "CHANGEMENT_EQUIPE": 3,
    "CHANGEMENT_SALAIRE": 4,
    "DEPART": 5,
    "RETOUR": 6,
}


@dataclass(frozen=True)
class Bulletin:
    """Un bulletin avec les libellés dont le parcours a besoin (fonction, code chantier, code équipe)."""

    paie: Paie
    fonction: str
    chantier: str
    equipe: str | None


async def employe_existe(s: AsyncSession, employee_id: int) -> bool:
    return (await s.execute(select(Employee.id).where(Employee.id == employee_id))).first() is not None


async def bulletins_de(s: AsyncSession, employee_id: int) -> list[Bulletin]:
    q = (
        select(Paie, Fonction.libelle, Chantier.code, Equipe.code)
        .join(Fonction, Fonction.id == Paie.fonction_id)
        .join(Chantier, Chantier.id == Paie.chantier_id)
        .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
        .where(Paie.employee_id == employee_id)
        .order_by(Paie.periode.asc())
    )
    return [
        Bulletin(paie, fonction, chantier, equipe) for paie, fonction, chantier, equipe in (await s.execute(q)).all()
    ]


async def departs_de(s: AsyncSession, employee_id: int) -> list[tuple[int, str]]:
    q = (
        select(EmployeeSortie.periode, EmployeeSortie.motif)
        .where(EmployeeSortie.employee_id == employee_id)
        .order_by(EmployeeSortie.periode.asc(), EmployeeSortie.id.asc())
    )
    return [(periode, motif) for periode, motif in (await s.execute(q)).all()]


async def tous_les_departs(s: AsyncSession) -> list[tuple[int, int]]:
    q = select(EmployeeSortie.periode, EmployeeSortie.employee_id).order_by(EmployeeSortie.periode.asc())
    return [(periode, employee_id) for periode, employee_id in (await s.execute(q)).all()]


async def lignes_effectifs(s: AsyncSession, c: PaieRecherche) -> list[tuple[int, int, int]]:
    """(mois, employé, chantier du mois) des bulletins du périmètre filtré."""
    q = select(Paie.periode, Paie.employee_id, Paie.chantier_id).join(Employee, Employee.id == Paie.employee_id)
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
    return [(p, e, ch) for p, e, ch in (await s.execute(q.order_by(Paie.periode.asc()))).all()]


def _plain(montant: Decimal) -> str:
    return format(montant, "f")


def mois_du_parcours(bulletins: Sequence[Bulletin]) -> list[PaieParcoursMois]:
    return [
        PaieParcoursMois(
            bulletin_id=b.paie.id,
            periode=b.paie.periode,
            fonction=b.fonction,
            chantier=b.chantier,
            equipe=b.equipe,
            nombre_jours_travailles=b.paie.nombre_jours_travailles,
            salaire_mensuel=b.paie.salaire_mensuel,
            salaire_total=b.paie.salaire_total,
            observation=b.paie.observation,
        )
        for b in sorted(bulletins, key=lambda b: b.paie.periode, reverse=True)
    ]


def evenements_du_parcours(
    bulletins: Sequence[Bulletin], departs: Sequence[tuple[int, str]]
) -> list[PaieParcoursEvenement]:
    """Chaque différence entre deux mois qui se suivent est un événement ; une paie après un départ est un retour."""
    evenements: list[PaieParcoursEvenement] = []

    def ajouter(
        periode: int, type_: str, avant: str | None = None, apres: str | None = None, motif: str | None = None
    ) -> None:
        evenements.append(PaieParcoursEvenement(periode=periode, type=type_, avant=avant, apres=apres, motif=motif))

    precedent: Bulletin | None = None
    for b in bulletins:
        if precedent is None:
            ajouter(b.paie.periode, "ENTREE", apres=f"{b.chantier} · {b.fonction}")
        else:
            if any(precedent.paie.periode <= periode < b.paie.periode for periode, _ in departs):
                ajouter(b.paie.periode, "RETOUR")
            for type_, avant, apres in (
                ("CHANGEMENT_CHANTIER", precedent.chantier, b.chantier),
                ("CHANGEMENT_FONCTION", precedent.fonction, b.fonction),
                ("CHANGEMENT_EQUIPE", precedent.equipe, b.equipe),
            ):
                if avant != apres:
                    ajouter(b.paie.periode, type_, avant, apres)
            if precedent.paie.salaire_mensuel != b.paie.salaire_mensuel:
                ajouter(
                    b.paie.periode,
                    "CHANGEMENT_SALAIRE",
                    _plain(precedent.paie.salaire_mensuel),
                    _plain(b.paie.salaire_mensuel),
                )
        precedent = b
    for periode, motif in departs:
        ajouter(periode, "DEPART", motif=motif)
    return sorted(evenements, key=lambda e: (e.periode, _RANG_TYPE[e.type]), reverse=True)


def tendances_effectifs(
    lignes: Sequence[tuple[int, int, int]], departs: Sequence[tuple[int, int]]
) -> list[PaieEffectifMois]:
    """Effectif, entrées, sorties, mutations et « plus payés » de chaque mois face au mois civil précédent."""
    par_mois: dict[int, dict[int, int]] = defaultdict(dict)
    for periode, employee_id, chantier_id in lignes:
        par_mois[periode][employee_id] = chantier_id
    departs_par_mois: dict[int, list[int]] = defaultdict(list)
    for periode, employee_id in departs:
        departs_par_mois[periode].append(employee_id)

    tendances: list[PaieEffectifMois] = []
    premier = True
    for periode in sorted(par_mois):
        courant = par_mois[periode]
        mois_avant = par_mois.get(mois_precedent(periode))
        avant = mois_avant if mois_avant is not None else {}
        # Un départ compte dans le périmètre si l'employé y était payé ce mois-ci ou le mois d'avant.
        sorties = sum(1 for e in departs_par_mois.get(periode, []) if e in courant or e in avant)
        entrees: int | None = None
        mutations: int | None = None
        if not premier:
            entrees = sum(1 for e in courant if e not in avant)
            mutations = sum(1 for e, chantier in courant.items() if e in avant and avant[e] != chantier)
        effectif_precedent = len(mois_avant) if mois_avant is not None else None
        variation = len(courant) - effectif_precedent if effectif_precedent is not None else None
        plus_payes = (
            effectif_precedent + entrees - len(courant)
            if effectif_precedent is not None and entrees is not None
            else None
        )
        tendances.append(
            PaieEffectifMois(
                periode=periode,
                effectif=len(courant),
                effectif_mois_precedent=effectif_precedent,
                variation=variation,
                entrees=entrees,
                plus_payes=plus_payes,
                sorties=sorties,
                mutations=mutations,
            )
        )
        premier = False
    return tendances
