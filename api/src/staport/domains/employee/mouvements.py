"""Mouvements d'effectif d'un mois : entrants et dernier bulletin des sortants, lus dans la paie.

Un entrant est un employé payé ce mois-ci et pas le mois civil précédent (même définition que les mouvements de la
paie et le rapport PDF). Les filtres de l'écran et des PDF passent tous par `correspond` : une règle, un seul endroit.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import ColumnElement, exists, func, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from staport.domains.chantier.models import Chantier
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction
from staport.domains.paie.models import Paie
from staport.domains.paie.periode import mois_precedent

from .models import Employee
from .schemas import (
    EmployeeEntrantReponse,
    EmployeeEntrantsMoisReponse,
    EmployeeEntrantsRecherche,
    EmployeeMouvementsRecherche,
    TypeEntree,
)


@dataclass(frozen=True)
class DernierBulletin:
    periode: int
    fonction: str
    chantier: str
    chantier_designation: str | None
    equipe: str | None
    jours: Decimal
    montant: Decimal
    observation: str | None
    fonction_id: int
    chantier_id: int
    equipe_id: int | None


async def derniers_bulletins(s: AsyncSession, employes: list[int], periode: int) -> dict[int, DernierBulletin]:
    """Le dernier bulletin de chaque employé au mois donné ou avant (une requête, `DISTINCT ON`)."""
    if not employes:
        return {}
    lignes = (
        await s.execute(
            select(
                Paie.employee_id,
                Paie.periode,
                Fonction.libelle,
                Chantier.code,
                Chantier.designation,
                Equipe.libelle,
                Paie.nombre_jours_travailles,
                Paie.salaire_total,
                Paie.observation,
                Paie.fonction_id,
                Paie.chantier_id,
                Paie.equipe_id,
            )
            .join(Fonction, Fonction.id == Paie.fonction_id)
            .join(Chantier, Chantier.id == Paie.chantier_id)
            .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
            .where(Paie.employee_id.in_(employes), Paie.periode <= periode)
            .ext(distinct_on(Paie.employee_id))
            .order_by(Paie.employee_id, Paie.periode.desc())
        )
    ).all()
    return {ligne[0]: DernierBulletin(*ligne[1:]) for ligne in lignes}


def anciennete_mois(embauche: date, periode: int) -> int:
    """Mois entiers entre le mois d'embauche et le mois de départ (jamais négatif)."""
    return max(0, (periode // 100 - embauche.year) * 12 + (periode % 100 - embauche.month))


def correspond(
    c: EmployeeMouvementsRecherche,
    *,
    nom_prenom: str,
    cin: str,
    fonction_id: int | None,
    chantier_id: int | None,
    equipe_id: int | None,
) -> bool:
    """Filtres de nom et CIN (« contient », sans casse), de fonctions, de chantiers et d'équipes (`0` = sans équipe)."""
    for saisi, valeur in ((c.nom_prenom, nom_prenom), (c.cin, cin)):
        if saisi and saisi.strip() and saisi.strip().casefold() not in valeur.casefold():
            return False
    if c.fonction_ids and fonction_id not in c.fonction_ids:
        return False
    if c.chantier_ids and chantier_id not in c.chantier_ids:
        return False
    return not (c.equipe_ids and (equipe_id or 0) not in c.equipe_ids)


async def entrants_mois(
    s: AsyncSession, periode: int, c: EmployeeEntrantsRecherche | None = None, *, avec_paie: bool = False
) -> EmployeeEntrantsMoisReponse:
    """Entrants du mois avec leur type et leur dernier chantier connu ; montants et jours exigent `avec_paie`."""
    avant = mois_precedent(periode)
    async with s.begin():
        mois_payes = set(
            (await s.execute(select(Paie.periode).where(Paie.periode.in_([periode, avant])).distinct())).scalars()
        )
        if mois_payes != {periode, avant}:
            return EmployeeEntrantsMoisReponse(
                periode=periode, comparable=False, nombre=0, nouvelles_embauches=0, retours=0, entrants=[]
            )
        paie_avant = aliased(Paie)
        lignes = (
            await s.execute(
                select(Paie, Employee, Fonction.libelle, Chantier.code, Chantier.designation, Equipe.libelle)
                .join(Employee, Employee.id == Paie.employee_id)
                .join(Fonction, Fonction.id == Paie.fonction_id)
                .join(Chantier, Chantier.id == Paie.chantier_id)
                .outerjoin(Equipe, Equipe.id == Paie.equipe_id)
                .where(
                    Paie.periode == periode,
                    ~exists().where(paie_avant.employee_id == Paie.employee_id, paie_avant.periode == avant),
                )
                .order_by(Employee.nom_prenom, Employee.id)
            )
        ).all()
        precedents = await derniers_bulletins(s, [employe.id for _, employe, *_ in lignes], avant)
    filtre = c or EmployeeEntrantsRecherche(periode=periode)
    entrants: list[EmployeeEntrantReponse] = []
    for bulletin, employe, fonction, chantier, designation, equipe in lignes:
        if not correspond(
            filtre,
            nom_prenom=employe.nom_prenom,
            cin=employe.cin,
            fonction_id=bulletin.fonction_id,
            chantier_id=bulletin.chantier_id,
            equipe_id=bulletin.equipe_id,
        ):
            continue
        precedent = precedents.get(employe.id)
        type_entree = TypeEntree.RETOUR if precedent else TypeEntree.NOUVELLE_EMBAUCHE
        if filtre.types and type_entree not in filtre.types:
            continue
        entrants.append(
            EmployeeEntrantReponse(
                employe_id=employe.id,
                nom_prenom=employe.nom_prenom,
                cin=employe.cin,
                periode=periode,
                type=type_entree,
                date_embauche=employe.date_embauche,
                statut_actuel=employe.statut,
                fonction_id=bulletin.fonction_id,
                fonction=fonction,
                chantier_id=bulletin.chantier_id,
                chantier=chantier,
                chantier_designation=designation,
                equipe_id=bulletin.equipe_id,
                equipe=equipe,
                chantier_precedent=precedent.chantier if precedent else None,
                derniere_paie_precedente=precedent.periode if precedent else None,
                salaire=employe.salaire if avec_paie else None,
                type_salaire=employe.type_salaire if avec_paie else None,
                jours_travailles=bulletin.nombre_jours_travailles if avec_paie else None,
                montant_bulletin=bulletin.salaire_total if avec_paie else None,
                observation=bulletin.observation if avec_paie else None,
            )
        )
    retours = sum(1 for e in entrants if e.type is TypeEntree.RETOUR)
    return EmployeeEntrantsMoisReponse(
        periode=periode,
        comparable=True,
        nombre=len(entrants),
        nouvelles_embauches=len(entrants) - retours,
        retours=retours,
        entrants=entrants,
    )


async def effectif_paye(s: AsyncSession, periode: int, c: EmployeeMouvementsRecherche) -> int:
    """Salariés payés le mois donné dans le périmètre des filtres : le dénominateur du solde net des PDF."""
    q = select(func.count()).select_from(Paie).join(Employee, Employee.id == Paie.employee_id)
    conditions: list[ColumnElement[bool]] = [Paie.periode == periode]
    if c.nom_prenom and c.nom_prenom.strip():
        conditions.append(func.lower(Employee.nom_prenom).like(motif_contient(c.nom_prenom), escape=ECHAPPEMENT))
    if c.cin and c.cin.strip():
        conditions.append(func.lower(Employee.cin).like(motif_contient(c.cin), escape=ECHAPPEMENT))
    if c.fonction_ids:
        conditions.append(Paie.fonction_id.in_(c.fonction_ids))
    if c.chantier_ids:
        conditions.append(Paie.chantier_id.in_(c.chantier_ids))
    if c.equipe_ids:
        equipes = [x for x in c.equipe_ids if x]
        sans_equipe = 0 in c.equipe_ids
        conditions.append(
            or_(Paie.equipe_id.in_(equipes), Paie.equipe_id.is_(None)) if sans_equipe else Paie.equipe_id.in_(equipes)
        )
    async with s.begin():
        return (await s.execute(q.where(*conditions))).scalar_one()
