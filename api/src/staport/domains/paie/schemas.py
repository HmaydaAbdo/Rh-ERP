from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import Field

from staport.domains.common.schemas import ModeleApi, Page

DeuxDecimales = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]


class PaieCreationRequete(ModeleApi):
    employee_id: int
    periode: Annotated[int, Field(ge=190001, le=299912)]
    fonction_id: int
    chantier_id: int
    equipe_id: int | None = None
    nombre_jours_travailles: Annotated[Decimal, Field(ge=0, max_digits=5, decimal_places=2)]
    jours_recuperation_ouvrable: Annotated[Decimal | None, Field(default=None, ge=0, max_digits=5, decimal_places=2)]
    jours_recuperation_dimanche: Annotated[Decimal | None, Field(default=None, ge=0, max_digits=5, decimal_places=2)]
    salaire_mensuel: DeuxDecimales
    prime_roulage_ordinaire: DeuxDecimales | None = None
    prime_roulage_dimanche: DeuxDecimales | None = None
    salaire_total: DeuxDecimales
    observation: str | None = Field(default=None, max_length=255)


class PaieModificationRequete(PaieCreationRequete):
    version: int


class PaieRecherche(ModeleApi):
    cin: str | None = Field(default=None, max_length=30)
    nom_prenom: str | None = Field(default=None, max_length=150)
    employee_id: int | None = None
    periode: int | None = Field(default=None, ge=190001, le=299912)
    fonction_ids: list[int] | None = None
    chantier_ids: list[int] | None = None
    equipe_ids: list[int] | None = None


class PaieReponse(ModeleApi):
    id: int
    version: int
    employee_id: int
    periode: int
    fonction_id: int
    chantier_id: int
    equipe_id: int | None
    nombre_jours_travailles: Decimal
    jours_recuperation_ouvrable: Decimal | None
    jours_recuperation_dimanche: Decimal | None
    salaire_mensuel: Decimal
    prime_roulage_ordinaire: Decimal | None
    prime_roulage_dimanche: Decimal | None
    salaire_total: Decimal
    observation: str | None


PaiesPage = Page[PaieReponse]


class PaiePeriodeResume(ModeleApi):
    periode: int
    nombre_bulletins: int
    nombre_chantiers: int
    masse: Decimal


class PaieAnalytiqueReponse(ModeleApi):
    periode: int
    nombre_bulletins: int
    masse: Decimal
    salaire_moyen: Decimal | None
    nombre_employes: int


class PaieOptionsChantierRequete(ModeleApi):
    periode: int = Field(ge=190001, le=299912)
    recherche: str | None = Field(default=None, max_length=100)


class PaieOptionsEquipeRequete(ModeleApi):
    periode: int = Field(ge=190001, le=299912)
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
    periode: int
    effectif: int
    effectif_mois_precedent: int | None
    variation: int | None
    entrees: int
    plus_payes: int | None
    sorties: int
    mutations: int | None


class PaieParcoursMois(ModeleApi):
    bulletin_id: int
    periode: int
    fonction_id: int
    chantier_id: int
    equipe_id: int | None
    nombre_jours_travailles: Decimal
    salaire_mensuel: Decimal
    salaire_total: Decimal
    observation: str | None


class PaieParcoursEvenement(ModeleApi):
    periode: int
    type: str
    avant: str | None
    apres: str | None
    motif: str | None


class PaieParcoursReponse(ModeleApi):
    employe_id: int
    mois_payes: int
    total_percu: Decimal
    jours_travailles: Decimal
    premier_mois: int | None
    dernier_mois: int | None
    mois: list[PaieParcoursMois]
    evenements: list[PaieParcoursEvenement]


class PaieExportRequete(ModeleApi):
    periode: int = Field(ge=190001, le=299912)
    feuilles_equipe_mode: Literal["AUCUNE", "TOUTES", "PERSONNALISE"] = "AUCUNE"
    equipes_par_chantier: dict[str, list[str]] | None = None
    equipes_exclues_feuille_chantier: dict[str, list[str]] | None = None
    chantiers: list[str] | None = None
    # Compatibilité du premier contrat Python ; les nouveaux clients utilisent equipes_par_chantier.
    regroupements_equipes: dict[str, list[str]] = Field(default_factory=dict)
    materiel: dict[str, int] | None = None


class PaieRapportRequete(ModeleApi):
    periode: int = Field(ge=190001, le=299912)
    nom_prenom: str | None = Field(default=None, max_length=150)
    cin: str | None = Field(default=None, max_length=30)
    fonction_id: int | None = None
    chantier_ids: list[int] | None = None
    chantier_id: int | None = None
    equipes_par_chantier: dict[str, list[str]] | None = None
    materiel: dict[str, int] | None = None
    sans_vue_ensemble: bool | None = None


class PaieImportErreur(ModeleApi):
    numero_ligne: int
    cin: str | None
    nom_prenom: str | None
    champ: str | None
    valeur: str | None
    raison: str
    avertissement: bool = False


class PaieImportAnalyse(ModeleApi):
    periode: int
    total_lignes: int
    erreurs: list[PaieImportErreur]
    avertissements: list[PaieImportErreur]
    pret: bool


class PaieImportCorrection(ModeleApi):
    employee_id: int
    nom_prenom: str | None = Field(default=None, max_length=150)
    fonction_id: int | None = None
    chantier_id: int | None = None
    equipe_id: int | None = None
    salaire: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    type_salaire: str | None = Field(default=None, max_length=20)


class PaieImportCreation(ModeleApi):
    nom_prenom: str = Field(min_length=1, max_length=150)
    cin: str = Field(min_length=1, max_length=30)
    date_naissance: date
    date_embauche: date
    fonction_id: int
    chantier_id: int
    equipe_id: int | None = None
    salaire: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    type_salaire: str | None = Field(default=None, max_length=20)
