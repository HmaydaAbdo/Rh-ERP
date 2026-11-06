"""Résumés de mois et de chantiers pour les cartes de paie et l'assistant d'export."""

from collections import defaultdict
from decimal import Decimal
from typing import cast

from staport.domains.equipe.models import Equipe

from .analytique import Ligne
from .rapport_calcul import BulletinRapport, mesurer
from .schemas import (
    PaieChantierPeriode,
    PaieEquipePeriode,
    PaiePeriodeComparaison,
    PaiePeriodeResume,
)


def _mesure(lignes: list[Ligne]):
    return mesurer(cast(list[BulletinRapport], [ligne[0] for ligne in lignes]))


def periodes(lignes: list[Ligne]) -> list[PaiePeriodeResume]:
    groupes: dict[int, list[Ligne]] = defaultdict(list)
    for ligne in lignes:
        groupes[ligne[0].periode].append(ligne)
    return [
        PaiePeriodeResume(
            periode=mois,
            nombre_bulletins=mesure.effectif,
            nombre_chantiers=mesure.chantiers,
            masse=mesure.masse,
            stc=mesure.stc,
            stc_montant=mesure.montant_stc,
        )
        for mois in sorted(groupes, reverse=True)
        for mesure in [_mesure(groupes[mois])]
    ]


def _comparaison(lignes: list[Ligne], periode: int) -> PaiePeriodeComparaison | None:
    if not lignes:
        return None
    mesure = _mesure(lignes)
    return PaiePeriodeComparaison(
        periode=periode,
        effectif=mesure.effectif,
        masse=mesure.masse,
        stc=mesure.stc,
        stc_montant=mesure.montant_stc,
    )


def chantiers(periode: int, lignes: list[Ligne]) -> list[PaieChantierPeriode]:
    annee, mois = divmod(periode, 100)
    precedent = (annee - 1) * 100 + 12 if mois == 1 else annee * 100 + mois - 1
    courant: dict[int, list[Ligne]] = defaultdict(list)
    ancien: dict[int, list[Ligne]] = defaultdict(list)
    for ligne in lignes:
        chantier_id = ligne[3].id
        if ligne[0].periode == periode:
            courant[chantier_id].append(ligne)
        elif ligne[0].periode == precedent:
            ancien[chantier_id].append(ligne)
    resultat = []
    for chantier_id, bulletins in courant.items():
        chantier = bulletins[0][3]
        mesure = _mesure(bulletins)
        groupes_equipes: dict[int, list[Ligne]] = defaultdict(list)
        for ligne in bulletins:
            if ligne[4] is not None:
                groupes_equipes[ligne[4].id].append(ligne)
        equipes = []
        for equipe_id, membres in groupes_equipes.items():
            equipe = cast(Equipe, membres[0][4])
            compteur = _mesure(membres)
            avant = [ligne for ligne in ancien[chantier_id] if ligne[4] is not None and ligne[4].id == equipe_id]
            equipes.append(
                PaieEquipePeriode(
                    id=equipe.id,
                    code=equipe.code,
                    libelle=equipe.libelle,
                    effectif=compteur.effectif,
                    masse=compteur.masse,
                    stc=compteur.stc,
                    stc_montant=compteur.montant_stc,
                    mois_precedent=_comparaison(avant, precedent),
                )
            )
        avant_chantier = ancien[chantier_id]
        avant_sans_equipe = [ligne for ligne in avant_chantier if ligne[4] is None]
        resultat.append(
            PaieChantierPeriode(
                id=chantier.id,
                code=chantier.code,
                libelle=chantier.nom.strip() if chantier.nom and chantier.nom.strip() else chantier.designation,
                effectif=mesure.effectif,
                masse=mesure.masse,
                stc=mesure.stc,
                stc_montant=mesure.montant_stc,
                mois_precedent=_comparaison(avant_chantier, precedent),
                sans_equipe_mois_precedent=_comparaison(avant_sans_equipe, precedent)
                if avant_sans_equipe
                else PaiePeriodeComparaison(
                    periode=precedent, effectif=0, masse=Decimal(0), stc=0, stc_montant=Decimal(0)
                )
                if avant_chantier
                else None,
                equipes=sorted(equipes, key=lambda equipe: equipe.code),
            )
        )
    return sorted(resultat, key=lambda chantier: -chantier.masse)
