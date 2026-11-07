from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from staport.domains.chantier.models import Chantier
from staport.domains.common.pagination import Pagination
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .models import Employee
from .schemas import EmployeeRecherche

_FONCTION = aliased(Fonction)
_CHANTIER = aliased(Chantier)
_EQUIPE = aliased(Equipe)
_JOINTURES: dict[str, tuple[Any, ColumnElement[bool]]] = {
    "fonction": (_FONCTION, _FONCTION.id == Employee.fonction_id),
    "chantier": (_CHANTIER, _CHANTIER.id == Employee.chantier_id),
    "equipe": (_EQUIPE, _EQUIPE.id == Employee.equipe_id),
}
# Nom de tri public (celui du JSON, comme Spring Data) -> (colonne, jointure externe nécessaire ou None).
_TRIS: dict[str, tuple[Any, str | None]] = {
    "id": (Employee.id, None),
    "version": (Employee.version, None),
    "nomPrenom": (Employee.nom_prenom, None),
    "cin": (Employee.cin, None),
    "dateEmbauche": (Employee.date_embauche, None),
    "statut": (Employee.statut, None),
    "salaire": (Employee.salaire, None),
    "typeSalaire": (Employee.type_salaire, None),
    "fonction.libelle": (_FONCTION.libelle, "fonction"),
    "chantier.code": (_CHANTIER.code, "chantier"),
    "equipe.libelle": (_EQUIPE.libelle, "equipe"),
}
TRIS_PUBLICS = frozenset(_TRIS)
# Données de paie : réservées à `PAIE_READ` (Spring : `ProjectionPaieEmployee.CHAMPS_DE_PAIE`, tris retirés sinon).
CHAMPS_DE_PAIE = frozenset({"salaire", "typeSalaire"})
# Noms internes (appels programmatiques, p. ex. outils MCP) acceptés en plus des noms publics.
_ALIAS_INTERNES = {"nom_prenom": "nomPrenom"}


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
    criteres = [(_TRIS[_ALIAS_INTERNES.get(champ, champ)], asc) for champ, asc in p.tri]
    for jointure in dict.fromkeys(j for (_, j), _ in criteres if j):
        cible, condition = _JOINTURES[jointure]
        q = q.outerjoin(cible, condition)
    for (colonne, _), asc in criteres:
        q = q.order_by(colonne.asc() if asc else colonne.desc())
    q = q.order_by(Employee.id.asc()).limit(p.taille).offset(p.decalage)
    return (await s.execute(q)).scalars().all(), total
