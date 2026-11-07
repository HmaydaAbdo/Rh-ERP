from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field

from staport.domains.common.schemas import ModeleApi, Nombre, Page

from .periode import PeriodePaie

DeuxDecimales = Annotated[Nombre, Field(ge=0, max_digits=10, decimal_places=2)]


class PaieChampsBulletin(ModeleApi):
    fonction_id: int
    chantier_id: int
    equipe_id: int | None = None
    nombre_jours_travailles: Annotated[Nombre, Field(ge=0, max_digits=5, decimal_places=2)]
    jours_recuperation_ouvrable: Annotated[Nombre | None, Field(default=None, ge=0, max_digits=5, decimal_places=2)]
    jours_recuperation_dimanche: Annotated[Nombre | None, Field(default=None, ge=0, max_digits=5, decimal_places=2)]
    salaire_mensuel: DeuxDecimales
    prime_roulage_ordinaire: DeuxDecimales | None = None
    prime_roulage_dimanche: DeuxDecimales | None = None
    salaire_total: DeuxDecimales
    observation: str | None = Field(default=None, max_length=255)


class PaieCreationRequete(PaieChampsBulletin):
    employee_id: int
    periode: PeriodePaie


class PaieModificationRequete(PaieChampsBulletin):
    version: int


class PaieRecherche(ModeleApi):
    cin: str | None = Field(default=None, max_length=30)
    nom_prenom: str | None = Field(default=None, max_length=150)
    employee_id: int | None = None
    periode: PeriodePaie | None = None
    fonction_ids: list[int] | None = None
    chantier_ids: list[int] | None = None
    equipe_ids: list[int] | None = None


class PaieSuppressionGroupeRequete(ModeleApi):
    """Groupe décrit par `criteres` (mois obligatoire) ; `nombre_attendu` est le nombre confirmé par l'utilisateur."""

    criteres: PaieRecherche
    nombre_attendu: Annotated[int, Field(ge=0)]


class PaieSuppression(ModeleApi):
    supprimes: int


class PaieRestauration(ModeleApi):
    restaures: int


class PaieEmployeeResume(ModeleApi):
    id: int
    nom_prenom: str
    cin: str


class PaieFonctionResume(ModeleApi):
    id: int
    libelle: str


class PaieChantierResume(ModeleApi):
    id: int
    code: str
    designation: str | None


class PaieEquipeResume(ModeleApi):
    id: int
    code: str
    libelle: str


class PaieReponse(ModeleApi):
    id: int
    version: int
    employee: PaieEmployeeResume
    periode: PeriodePaie
    fonction: PaieFonctionResume
    chantier: PaieChantierResume
    equipe: PaieEquipeResume | None
    nombre_jours_travailles: Nombre
    jours_recuperation_ouvrable: Nombre | None
    jours_recuperation_dimanche: Nombre | None
    salaire_mensuel: Nombre
    prime_roulage_ordinaire: Nombre | None
    prime_roulage_dimanche: Nombre | None
    salaire_total: Nombre
    observation: str | None


PaiesPage = Page[PaieReponse]


class PaiePeriodeResume(ModeleApi):
    periode: PeriodePaie
    nombre_bulletins: int
    nombre_chantiers: int
    masse: Nombre
    stc: int
    stc_montant: Nombre


class PaiePeriodeComparaison(ModeleApi):
    periode: PeriodePaie
    effectif: int
    masse: Nombre
    stc: int
    stc_montant: Nombre


class PaieEquipePeriode(ModeleApi):
    id: int
    code: str
    libelle: str
    effectif: int
    masse: Nombre
    stc: int
    stc_montant: Nombre
    mois_precedent: PaiePeriodeComparaison | None


class PaieChantierPeriode(ModeleApi):
    id: int
    code: str
    libelle: str | None
    effectif: int
    masse: Nombre
    stc: int
    stc_montant: Nombre
    mois_precedent: PaiePeriodeComparaison | None
    sans_equipe_mois_precedent: PaiePeriodeComparaison | None
    equipes: list[PaieEquipePeriode]


class PaieMaterielTableau(ModeleApi):
    chantier_code: str
    equipe_code: str
    titre: str
    libelles: list[str]


class PaieKpi(ModeleApi):
    masse: Nombre
    effectif: int
    cout_moyen: Nombre | None
    nombre_chantiers: int
    stc: int
    stc_montant: Nombre


class PaieChantierMasse(ModeleApi):
    id: int
    code: str
    libelle: str | None
    masse: Nombre
    effectif: int
    stc: int
    stc_montant: Nombre


class PaieEquipeMasse(ModeleApi):
    id: int | None
    code: str | None
    libelle: str | None
    masse: Nombre
    effectif: int
    stc: int
    stc_montant: Nombre


class PaieFonctionMasse(ModeleApi):
    id: int
    libelle: str
    masse: Nombre
    effectif: int
    stc: int
    stc_montant: Nombre


class PaieTranche(ModeleApi):
    min: Nombre
    max: Nombre | None
    effectif: int


class PaieEvolution(ModeleApi):
    periode: PeriodePaie
    masse: Nombre
    effectif: int
    stc: int
    stc_montant: Nombre


class PaieQualite(ModeleApi):
    sans_equipe: int
    sans_observation: int


class PaieAnalytiqueReponse(ModeleApi):
    periode: PeriodePaie
    kpis: PaieKpi
    mois_precedent: PaieKpi | None
    par_chantier: list[PaieChantierMasse]
    par_equipe: list[PaieEquipeMasse]
    par_fonction: list[PaieFonctionMasse]
    tranches: list[PaieTranche]
    evolution: list[PaieEvolution]
    qualite: PaieQualite


class PaieOptionsChantierRequete(ModeleApi):
    periode: PeriodePaie
    recherche: str | None = Field(default=None, max_length=100)


class PaieOptionsEquipeRequete(ModeleApi):
    periode: PeriodePaie
    chantier_ids: list[int] = Field(min_length=1, max_length=500)
    recherche: str | None = Field(default=None, max_length=100)


class PaieChantierOption(ModeleApi):
    id: int
    code: str
    nom: str | None
    designation: str | None
    actif: bool


class PaieEquipeOption(ModeleApi):
    id: int
    code: str
    libelle: str


class PaieEffectifMois(ModeleApi):
    periode: PeriodePaie
    effectif: int
    effectif_mois_precedent: int | None
    variation: int | None
    entrees: int | None
    plus_payes: int | None
    sorties: int
    mutations: int | None


class PaieParcoursMois(ModeleApi):
    """La photo du bulletin : libellé de la fonction, codes du chantier et de l'équipe du mois (`MoisDto`)."""

    bulletin_id: int
    periode: PeriodePaie
    fonction: str
    chantier: str
    equipe: str | None
    nombre_jours_travailles: Nombre
    salaire_mensuel: Nombre
    salaire_total: Nombre
    observation: str | None


class PaieParcoursEvenement(ModeleApi):
    periode: PeriodePaie
    type: str
    avant: str | None
    apres: str | None
    motif: str | None


class PaieParcoursIndicateurs(ModeleApi):
    mois_payes: int
    total_percu: Nombre
    jours_travailles: Nombre
    premier_mois: PeriodePaie | None
    dernier_mois: PeriodePaie | None


class PaieParcoursReponse(ModeleApi):
    employe_id: int
    indicateurs: PaieParcoursIndicateurs
    mois: list[PaieParcoursMois]
    evenements: list[PaieParcoursEvenement]


class DimensionPaie(StrEnum):
    CHANTIER = "CHANTIER"
    EQUIPE = "EQUIPE"
    FONCTION = "FONCTION"


class TriRepartition(StrEnum):
    MASSE = "MASSE"
    EFFECTIF = "EFFECTIF"
    STC = "STC"
    STC_MONTANT = "STC_MONTANT"
    LIBELLE = "LIBELLE"
    CODE = "CODE"


class TriComparaison(StrEnum):
    MASSE = "MASSE"
    VARIATION_MASSE = "VARIATION_MASSE"
    VARIATION_POURCENTAGE = "VARIATION_POURCENTAGE"
    EFFECTIF = "EFFECTIF"
    VARIATION_EFFECTIF = "VARIATION_EFFECTIF"
    LIBELLE = "LIBELLE"


class PaieRepartitionGroupe(ModeleApi):
    id: int | None
    code: str | None
    libelle: str | None
    masse: Nombre
    effectif: int
    stc: int
    stc_montant: Nombre


class PaieRepartitionReponse(ModeleApi):
    """Répartition d'un mois de paie triée selon le critère demandé (`PaieRepartitionDto`)."""

    periode: PeriodePaie
    dimension: DimensionPaie
    nombre_groupes: int
    groupes: list[PaieRepartitionGroupe]


class PaieComparaisonTotal(ModeleApi):
    masse: Nombre
    masse_reference: Nombre | None
    variation_masse: Nombre | None
    variation_pourcentage: Nombre | None
    effectif: int
    effectif_reference: int | None
    variation_effectif: int | None
    cout_moyen: Nombre | None
    cout_moyen_reference: Nombre | None


class PaieFonctionPrincipale(ModeleApi):
    libelle: str
    effectif: int


class PaieComparaisonGroupe(ModeleApi):
    """`statut` : COMPARABLE, NOUVEAU ou DISPARU ; les variations sont nulles si un mois manque."""

    id: int | None
    code: str | None
    libelle: str | None
    statut: Literal["COMPARABLE", "NOUVEAU", "DISPARU"]
    masse: Nombre | None
    masse_reference: Nombre | None
    variation_masse: Nombre | None
    variation_pourcentage: Nombre | None
    effectif: int | None
    effectif_reference: int | None
    variation_effectif: int | None
    cout_moyen: Nombre | None
    cout_moyen_reference: Nombre | None
    fonction_principale: PaieFonctionPrincipale | None


class PaieComparaisonReponse(ModeleApi):
    """Comparaison de deux mois de paie sur le même périmètre (`PaieComparaisonDto`)."""

    periode: PeriodePaie
    periode_reference: PeriodePaie
    dimension: DimensionPaie
    nombre_groupes: int
    total: PaieComparaisonTotal
    plus_forte_hausse: PaieComparaisonGroupe | None
    plus_forte_baisse: PaieComparaisonGroupe | None
    plus_forte_hausse_du_perimetre: PaieComparaisonGroupe | None
    plus_forte_baisse_du_perimetre: PaieComparaisonGroupe | None
    groupes: list[PaieComparaisonGroupe]
    definitions: dict[str, str]


class PaieExportRequete(ModeleApi):
    periode: PeriodePaie
    feuilles_equipe_mode: Literal["AUCUNE", "TOUTES", "PERSONNALISE"] = "AUCUNE"
    equipes_par_chantier: dict[str, list[str]] | None = None
    equipes_exclues_feuille_chantier: dict[str, list[str]] | None = None
    chantiers: list[str] | None = None
    # Compatibilité du premier contrat Python ; les nouveaux clients utilisent equipes_par_chantier.
    regroupements_equipes: dict[str, list[str]] = Field(default_factory=dict)
    materiel: dict[str, Annotated[int, Field(ge=0, le=999)]] | None = None


class PaieRapportRequete(ModeleApi):
    periode: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    nom_prenom: str | None = Field(default=None, max_length=150)
    cin: str | None = Field(default=None, max_length=30)
    fonction_id: int | None = None
    chantier_ids: list[int] | None = Field(default=None, max_length=500)
    chantier_id: int | None = None
    equipes_par_chantier: dict[str, list[str]] | None = None
    regroupements_equipes_par_chantier: dict[str, list[list[str]]] | None = None
    materiel: dict[str, Annotated[int | None, Field(ge=0, le=999)]] | None = None
    sans_vue_ensemble: bool | None = None


class PaieImportErreur(ModeleApi):
    numero_ligne: int
    cin: str | None
    nom_prenom: str | None
    champ: str | None
    valeur: str | None
    raison: str
    avertissement: bool = False
    code_avertissement: Literal["SALAIRE_ZERO", "SALAIRE_DIFFERENT", "EQUIPE_VIDE"] | None = None
    employe_id: int | None = None
    salaire_actuel: str | None = None
    type_salaire_propose: Literal["JOURNALIER", "MENSUEL"] | None = None


class PaieImportAnalyse(ModeleApi):
    periode: PeriodePaie
    total_lignes: int
    erreurs: list[PaieImportErreur]
    avertissements: list[PaieImportErreur]
    chantiers_clotures: list[PaieImportChantierCloture]
    cin_inconnus: list[PaieImportCinInconnu]
    ecarts: list[PaieImportEcart]
    departs: list[PaieImportDepart]
    retours: list[PaieImportRetour]
    pret: bool


class PaieImportDepart(ModeleApi):
    """Un employé qui quitte l'entreprise : STC ou sortie dans le fichier, ou actif absent du fichier (motif nul)."""

    employe_id: int
    cin: str
    nom_prenom: str
    motif: str | None


class PaieImportRetour(ModeleApi):
    """Un employé inactif présent dans le fichier : l'import le repasse ACTIF."""

    employe_id: int
    cin: str
    nom_prenom: str


class PaieImportDecisionEquipe(ModeleApi):
    """Choix de l'utilisateur quand le fichier laisse vide l'équipe d'un employé qui en a une."""

    employe_id: int
    action: Literal["CONSERVER", "VIDER"]


class PaieImportDecisionsEquipe(ModeleApi):
    decisions: list[PaieImportDecisionEquipe] = Field(default_factory=lambda: [])


class PaieImportDepartConfirme(ModeleApi):
    employe_id: int
    motif: Annotated[str, Field(min_length=1, max_length=255, pattern=r"\S")]


class PaieImportDeparts(ModeleApi):
    """Les départs confirmés à l'import : un départ proposé par l'analyse et absent d'ici n'est pas enregistré."""

    departs: list[PaieImportDepartConfirme] = Field(default_factory=lambda: [])


class PaieImportChantierCloture(ModeleApi):
    chantier_id: int
    code: str
    designation: str | None
    lignes: list[int]


class PaieImportCinInconnu(ModeleApi):
    numero_ligne: int
    cin: str
    nom_prenom: str | None
    fonction: str | None
    chantier: str | None
    equipe: str | None
    salaire: Nombre | None


class PaieImportChamp(ModeleApi):
    champ: str
    base: str | None
    fichier: str | None


class PaieImportEcart(ModeleApi):
    employe_id: int
    numero_ligne: int
    cin: str
    nom_prenom: str
    champs: list[PaieImportChamp]
    type_salaire: Literal["MENSUEL", "JOURNALIER"] | None


class PaieImportAlignement(ModeleApi):
    employe_id: int
    type_salaire: Literal["MENSUEL", "JOURNALIER"] | None = None


class PaieImportCreationCorrection(ModeleApi):
    numero_ligne: int
    date_naissance: date
    date_embauche: date
    type_salaire: Literal["MENSUEL", "JOURNALIER"]


class PaieImportCorrections(ModeleApi):
    aligner: list[PaieImportAlignement] = Field(default_factory=list)
    creer: list[PaieImportCreationCorrection] = Field(default_factory=list)


class PaieImportResult(ModeleApi):
    periode: str
    crees: int
    departs: int
    retours: int
