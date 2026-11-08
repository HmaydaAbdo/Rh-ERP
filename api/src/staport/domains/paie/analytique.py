"""Vue analytique de la paie sur les instantanés des bulletins."""

from collections import defaultdict
from decimal import ROUND_CEILING, ROUND_DOWN, Decimal
from typing import cast

from staport.domains.chantier.models import Chantier
from staport.domains.common.montant import arrondir_montant
from staport.domains.employee.models import Employee
from staport.domains.equipe.models import Equipe
from staport.domains.function.models import Fonction

from .models import Paie
from .rapport_calcul import BulletinRapport, mesurer
from .schemas import (
    PaieAnalytiqueReponse,
    PaieChantierMasse,
    PaieEquipeMasse,
    PaieEvolution,
    PaieFonctionMasse,
    PaieKpi,
    PaieQualite,
    PaieTranche,
)

Ligne = tuple[Paie, Employee, Fonction, Chantier, Equipe | None]


def _kpi(lignes: list[Ligne]) -> PaieKpi:
    mesure = mesurer(cast(list[BulletinRapport], [ligne[0] for ligne in lignes]))
    return PaieKpi(
        masse=mesure.masse,
        effectif=mesure.effectif,
        cout_moyen=arrondir_montant(mesure.masse / mesure.effectif) if mesure.effectif else None,
        nombre_chantiers=mesure.chantiers,
        stc=mesure.stc,
        stc_montant=mesure.montant_stc,
    )


def _groupes(lignes: list[Ligne], position: int) -> list[list[Ligne]]:
    groupes: dict[int | None, list[Ligne]] = defaultdict(list)
    for ligne in lignes:
        reference = ligne[position]
        groupes[reference.id if reference is not None else None].append(ligne)
    return sorted(groupes.values(), key=lambda groupe: -sum((x[0].salaire_total for x in groupe), Decimal(0)))


def construire_analytique(periode: int, lignes: list[Ligne], pas_tranche: Decimal) -> PaieAnalytiqueReponse:
    courant = [ligne for ligne in lignes if ligne[0].periode == periode]
    annee, mois = divmod(periode, 100)
    precedent = (annee - 1) * 100 + 12 if mois == 1 else annee * 100 + mois - 1
    ancien = [ligne for ligne in lignes if ligne[0].periode == precedent]
    par_mois: dict[int, list[Ligne]] = defaultdict(list)
    for ligne in lignes:
        par_mois[ligne[0].periode].append(ligne)
    evolution = [
        PaieEvolution(
            periode=mois,
            masse=kpi.masse,
            effectif=kpi.effectif,
            stc=kpi.stc,
            stc_montant=kpi.stc_montant,
        )
        for mois in sorted(par_mois)
        for kpi in [_kpi(par_mois[mois])]
    ]
    if not courant:
        return PaieAnalytiqueReponse(
            periode=periode,
            kpis=_kpi([]),
            mois_precedent=None,
            par_chantier=[],
            par_equipe=[],
            par_fonction=[],
            tranches=[],
            evolution=evolution,
            qualite=PaieQualite(sans_equipe=0, sans_observation=0),
        )
    chantiers: list[PaieChantierMasse] = []
    for groupe in _groupes(courant, 3):
        chantier = groupe[0][3]
        mesure = _kpi(groupe)
        chantiers.append(
            PaieChantierMasse(
                id=chantier.id,
                code=chantier.code,
                libelle=chantier.nom.strip() if chantier.nom and chantier.nom.strip() else chantier.designation,
                masse=mesure.masse,
                effectif=mesure.effectif,
                stc=mesure.stc,
                stc_montant=mesure.stc_montant,
            )
        )
    equipes: list[PaieEquipeMasse] = []
    for groupe in _groupes(courant, 4):
        equipe = groupe[0][4]
        mesure = _kpi(groupe)
        equipes.append(
            PaieEquipeMasse(
                id=equipe.id if equipe else None,
                code=equipe.code if equipe else None,
                libelle=equipe.libelle if equipe else None,
                masse=mesure.masse,
                effectif=mesure.effectif,
                stc=mesure.stc,
                stc_montant=mesure.stc_montant,
            )
        )
    fonctions: list[PaieFonctionMasse] = []
    for groupe in _groupes(courant, 2):
        fonction = groupe[0][2]
        mesure = _kpi(groupe)
        fonctions.append(
            PaieFonctionMasse(
                id=fonction.id,
                libelle=fonction.libelle,
                masse=mesure.masse,
                effectif=mesure.effectif,
                stc=mesure.stc,
                stc_montant=mesure.stc_montant,
            )
        )
    largeur = max(
        pas_tranche,
        (
            (max(x[0].salaire_total for x in courant) / 6).to_integral_value(rounding=ROUND_CEILING) / pas_tranche
        ).to_integral_value(rounding=ROUND_CEILING)
        * pas_tranche,
    )
    comptes = [0] * 6
    for ligne in courant:
        indice = int((ligne[0].salaire_total / largeur).to_integral_value(rounding=ROUND_DOWN))
        comptes[min(indice, 5)] += 1
    tranches = [
        PaieTranche(min=largeur * i, max=largeur * (i + 1) if i < 5 else None, effectif=comptes[i]) for i in range(6)
    ]
    return PaieAnalytiqueReponse(
        periode=periode,
        kpis=_kpi(courant),
        mois_precedent=_kpi(ancien) if ancien else None,
        par_chantier=chantiers,
        par_equipe=equipes,
        par_fonction=fonctions,
        tranches=tranches,
        evolution=evolution,
        qualite=PaieQualite(
            sans_equipe=sum(ligne[0].equipe_id is None for ligne in courant),
            sans_observation=sum(not (ligne[0].observation or "").strip() for ligne in courant),
        ),
    )
