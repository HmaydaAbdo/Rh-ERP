"""La fiche employé reprend l'état de son dernier bulletin (décision du propriétaire, ADR 0010).

Même règle que l'import et que la reprise `V30`, appliquée à chaque écriture manuelle de bulletin (création,
modification, suppression, restauration) :

- un bulletin « STC » ou « sortie » constate un départ à son mois (`employe_sortie`, motif « STC » ou « Sortie ») ;
  la fiche est INACTIVE tant qu'un départ est postérieur ou égal au dernier bulletin, sans chantier ni équipe
  (contrainte `ck_employe_affectations_statut`) ;
- sinon la fiche est ACTIVE et reprend fonction, chantier et équipe du dernier bulletin ; un employé sorti dont un
  bulletin plus récent que son départ apparaît fait un retour (comme l'import : type de salaire exigé, salaire repris) ;
- un bulletin d'un mois plus ancien que le dernier ne change jamais la fiche.
"""

from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.employee.models import Employee, EmployeeSortie, EmployeeStatut

from .exceptions import RetourSansTypeSalaire
from .models import Paie
from .observation import est_stc_ou_sortie

_MOTIFS_DU_BULLETIN = ("STC", "Sortie")


def _motif(observation: str | None) -> str:
    return "STC" if (observation or "").strip().lower() == "stc" else "Sortie"


async def aligner_fiche(s: AsyncSession, employee_id: int, periodes_touchees: Collection[int]) -> None:
    """Remet la fiche en accord avec ses bulletins (idempotent), et les départs des mois touchés avec leurs bulletins.

    Seuls les départs des mois écrits, modifiés ou supprimés suivent leur bulletin : un départ d'un autre mois (import,
    absence, motif libre) n'est jamais effacé ni renommé ici."""
    await s.flush()
    employe = await s.get(Employee, employee_id)
    if employe is None:
        return
    bulletins = list((await s.execute(select(Paie).where(Paie.employee_id == employee_id))).scalars())
    departs = list((await s.execute(select(EmployeeSortie).where(EmployeeSortie.employee_id == employee_id))).scalars())

    constates = {b.periode: _motif(b.observation) for b in bulletins if est_stc_ou_sortie(b.observation)}
    periodes_depart = {d.periode for d in departs}
    for periode, motif in constates.items():
        if periode not in periodes_depart:
            s.add(EmployeeSortie(employee_id=employee_id, periode=periode, motif=motif))
            periodes_depart.add(periode)
    for depart in departs:
        if depart.periode not in periodes_touchees or depart.motif not in _MOTIFS_DU_BULLETIN:
            continue
        if depart.periode not in constates:
            await s.delete(depart)
            periodes_depart.discard(depart.periode)
        else:
            depart.motif = constates[depart.periode]

    if not bulletins:
        return
    dernier = max(bulletins, key=lambda b: b.periode)
    employe.fonction_id = dernier.fonction_id
    if any(periode >= dernier.periode for periode in periodes_depart):
        employe.statut = EmployeeStatut.INACTIF
        employe.chantier_id = None
        employe.equipe_id = None
    else:
        if employe.statut == EmployeeStatut.INACTIF:
            if employe.type_salaire is None:
                raise RetourSansTypeSalaire(employe.nom_prenom)
            employe.salaire = dernier.salaire_mensuel
            employe.statut = EmployeeStatut.ACTIF
        employe.chantier_id = dernier.chantier_id
        employe.equipe_id = dernier.equipe_id
    await s.flush()
