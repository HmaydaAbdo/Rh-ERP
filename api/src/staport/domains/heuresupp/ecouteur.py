"""Les lignes suivent leur bulletin (parité de `EcouteurPaieHeuresSupp`), dans la transaction de la paie.

Appelé par `paie.service` et par l'import de paie : une modification du marqueur STC/sortie recalcule STC et net (le
forfait, interdit en STC/sortie, est annulé), un changement de fonction du bulletin est repris ; la suppression d'un
bulletin lié est refusée. Ce module n'importe rien de `paie.service`.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.paie.exceptions import PaieLiee
from staport.domains.paie.observation import est_stc_ou_sortie

from . import calcul, repository


async def paie_modifiee(s: AsyncSession, paie_id: int, observation: str | None, fonction_id: int | None = None) -> None:
    stc = est_stc_ou_sortie(observation)
    for ligne in await repository.du_bulletin(s, paie_id):
        if fonction_id is not None and ligne.fonction_id != fonction_id:
            ligne.fonction_id = fonction_id
        if ligne.est_stc_ou_sortie == stc:
            continue
        ligne.est_stc_ou_sortie = stc
        if stc:
            ligne.forfait = None
        ligne.stc_dh = calcul.stc_dh(ligne.montant, stc)
        ligne.net_a_payer = calcul.net_a_payer(ligne.montant, ligne.stc_dh, ligne.forfait)
    await s.flush()


async def suppression_demandee(s: AsyncSession, paie_ids: list[int]) -> None:
    if not paie_ids:
        return
    liees = await repository.nombre_liees(s, paie_ids)
    if liees > 0:
        raise PaieLiee(
            "Suppression impossible : une ligne d'heures supplémentaires s'appuie sur ce bulletin. "
            "Supprimez-la d'abord."
            if liees == 1
            else f"Suppression impossible : {liees} lignes d'heures supplémentaires s'appuient sur ces bulletins. "
            "Supprimez-les d'abord."
        )
