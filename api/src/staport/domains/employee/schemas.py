from datetime import date
from enum import StrEnum
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, Field, model_validator

from staport.domains.common.cles import Cin
from staport.domains.common.schemas import ModeleApi, Montant, Nombre, NonVide, Page, regle_metier
from staport.domains.paie.periode import PeriodePaie

from .models import Civilite, EmployeeStatut, TypeSalaire

MATRICULE_MAX = 20
CNSS_REGLE = "Le matricule CNSS ne contient que des chiffres, 20 au plus (ex. 123456789)."


def matricule_cnss_canonique(valeur: object) -> str:
    """Le matricule tel qu'enregistré : sans aucun espace ; un nombre lu d'Excel (123456789.0) redevient entier."""
    if isinstance(valeur, float) and valeur.is_integer():
        valeur = int(valeur)
    return "".join(str(valeur or "").split())


def _matricule_schema(valeur: object) -> object:
    return matricule_cnss_canonique(valeur) or None if isinstance(valeur, str | int | float) else valeur


def _matricule_controle(valeur: str | None) -> str | None:
    if valeur is not None and not (valeur.isascii() and valeur.isdigit() and len(valeur) <= MATRICULE_MAX):
        raise regle_metier("matriculeCnss", CNSS_REGLE)
    return valeur


MatriculeCnss = Annotated[str | None, BeforeValidator(_matricule_schema), AfterValidator(_matricule_controle)]
"""Matricule CNSS facultatif : espaces retirés, vide = absent, chiffres seulement."""


class _EmployeeBase(ModeleApi):
    nom_prenom: Annotated[NonVide, Field(max_length=150)]
    cin: Annotated[Cin, Field(max_length=30)]
    date_naissance: date
    date_embauche: date
    fonction_id: int
    equipe_id: int | None = None
    salaire: Montant | None = Field(default=None, ge=0, max_digits=10, decimal_places=0)
    # Facultatif : absent, le type se déduit du salaire ; présent, c'est le choix explicite de l'utilisateur.
    type_salaire: TypeSalaire | None = None
    # Déclaration CNSS et civilité (KAN-320) : facultatives ; absentes d'une modification, elles restent inchangées.
    matricule_cnss: MatriculeCnss = None
    date_declaration_cnss: date | None = None
    civilite: Civilite | None = None

    @model_validator(mode="after")
    def coherence(self):
        if self.salaire is None and self.type_salaire is not None:
            raise regle_metier("typeSansSalaire", "un type de salaire exige un salaire")
        if self.date_naissance >= date.today():
            raise regle_metier("dateNaissance", "la date de naissance doit être passée")
        if self.date_declaration_cnss is not None and self.date_declaration_cnss > date.today():
            raise regle_metier("dateDeclarationCnss", "la date de déclaration CNSS ne peut pas être future")
        return self


class EmployeeCreationRequete(_EmployeeBase):
    chantier_id: int


class EmployeeModificationRequete(_EmployeeBase):
    version: int
    chantier_id: int | None = None
    statut: EmployeeStatut

    @model_validator(mode="after")
    def affectations(self):
        coherent = (
            self.chantier_id is None and self.equipe_id is None
            if self.statut is EmployeeStatut.INACTIF
            else self.chantier_id is not None
        )
        if not coherent:
            raise regle_metier(
                "affectationsCoherentesAvecStatut",
                "un employé actif doit avoir un chantier; un employé inactif ne garde ni chantier ni équipe",
            )
        return self


class EmployeeRecherche(ModeleApi):
    nom_prenom: Annotated[str | None, Field(max_length=150)] = None
    cin: Annotated[str | None, Field(max_length=30)] = None
    # Zone unique : chaque mot se retrouve dans le nom, le prénom ou le CIN, dans n'importe quel ordre.
    recherche: Annotated[str | None, Field(max_length=150)] = None
    fonction_ids: list[int] | None = None
    chantier_ids: list[int] | None = None
    equipe_ids: list[int] | None = None
    statut: EmployeeStatut | None = None


class FonctionResume(ModeleApi):
    id: int
    libelle: str


class ChantierResume(ModeleApi):
    id: int
    code: str
    designation: str | None


class EquipeResume(ModeleApi):
    id: int
    code: str
    libelle: str


class EmployeeReponse(ModeleApi):
    id: int
    version: int
    nom_prenom: str
    cin: str
    date_naissance: date
    date_embauche: date
    fonction: FonctionResume
    chantier: ChantierResume | None
    equipe: EquipeResume | None
    salaire: Nombre | None
    type_salaire: TypeSalaire | None
    statut: EmployeeStatut
    matricule_cnss: str | None
    date_declaration_cnss: date | None
    civilite: Civilite | None


EmployeesPage = Page[EmployeeReponse]


class DimensionEmployes(StrEnum):
    CHANTIER = "CHANTIER"
    EQUIPE = "EQUIPE"
    FONCTION = "FONCTION"


class TriRegroupement(StrEnum):
    """Critère de tri des groupes d'effectif."""

    EFFECTIF = "EFFECTIF"
    EN_POSTE = "EN_POSTE"
    LIBELLE = "LIBELLE"
    CODE = "CODE"


class TrancheReponse(ModeleApi):
    min: int
    max: int | None
    effectif: int


class EmployeeAnalytiqueReponse(ModeleApi):
    effectif: int
    actifs: int
    inactifs: int
    age_moyen: Nombre | None
    anciennete_moyenne: Nombre | None
    embauches_douze_mois: int
    par_age: list[TrancheReponse]
    par_anciennete: list[TrancheReponse]


class EmployeeRegroupementReponse(ModeleApi):
    id: int
    code: str | None
    libelle: str
    effectif: int
    actifs: int


class EmployeeMouvementsRecherche(ModeleApi):
    """Mois et filtres communs aux sorties, aux entrants et aux PDF de mouvements (mêmes critères que l'écran)."""

    periode: PeriodePaie
    nom_prenom: Annotated[str | None, Field(max_length=150)] = None
    cin: Annotated[str | None, Field(max_length=30)] = None
    fonction_ids: Annotated[list[int] | None, Field(max_length=50)] = None
    chantier_ids: Annotated[list[int] | None, Field(max_length=50)] = None
    # `0` désigne les mouvements sans équipe, comme dans les autres recherches.
    equipe_ids: Annotated[list[int] | None, Field(max_length=50)] = None


class EmployeeSortiesRecherche(EmployeeMouvementsRecherche):
    motifs: Annotated[list[str] | None, Field(max_length=50)] = None


class TypeEntree(StrEnum):
    """Nouvelle embauche : aucun bulletin avant ce mois. Retour : déjà payé auparavant, absent le mois d'avant."""

    NOUVELLE_EMBAUCHE = "NOUVELLE_EMBAUCHE"
    RETOUR = "RETOUR"


class EmployeeEntrantsRecherche(EmployeeMouvementsRecherche):
    types: Annotated[list[TypeEntree] | None, Field(max_length=2)] = None


class EmployeeSortieReponse(ModeleApi):
    """Un départ du mois, avec l'affectation et le montant du dernier bulletin à ce mois ou avant."""

    employe_id: int
    nom_prenom: str
    cin: str
    periode: PeriodePaie
    motif: str
    date_embauche: date | None = None
    anciennete_mois: int | None = None
    statut_actuel: EmployeeStatut | None = None
    salaire: Nombre | None = None
    type_salaire: TypeSalaire | None = None
    fonction_id: int | None = None
    fonction: str | None = None
    chantier_id: int | None = None
    chantier: str | None = None
    chantier_designation: str | None = None
    equipe_id: int | None = None
    equipe: str | None = None
    derniere_paie: PeriodePaie | None = None
    jours_travailles: Nombre | None = None
    montant_dernier_bulletin: Nombre | None = None
    observation: str | None = None


class EmployeeSortiesMoisReponse(ModeleApi):
    periode: PeriodePaie
    nombre: int
    par_motif: dict[str, int]
    sorties: list[EmployeeSortieReponse]


class EmployeeEntrantReponse(ModeleApi):
    """Un entrant du mois : payé ce mois-ci, pas le mois civil précédent. Les champs de paie exigent `PAIE_READ`."""

    employe_id: int
    nom_prenom: str
    cin: str
    periode: PeriodePaie
    type: TypeEntree
    date_embauche: date | None = None
    statut_actuel: EmployeeStatut | None = None
    fonction_id: int
    fonction: str
    chantier_id: int
    chantier: str
    chantier_designation: str | None = None
    equipe_id: int | None = None
    equipe: str | None = None
    # Dernier chantier payé avant ce mois, pour un retour ; vide pour une nouvelle embauche.
    chantier_precedent: str | None = None
    derniere_paie_precedente: PeriodePaie | None = None
    salaire: Nombre | None = None
    type_salaire: TypeSalaire | None = None
    jours_travailles: Nombre | None = None
    montant_bulletin: Nombre | None = None
    observation: str | None = None


class EmployeeEntrantsMoisReponse(ModeleApi):
    periode: PeriodePaie
    # Faux quand le mois ou le mois civil précédent n'a aucun bulletin : on ne peut pas dire qui entre.
    comparable: bool
    nombre: int
    nouvelles_embauches: int
    retours: int
    entrants: list[EmployeeEntrantReponse]


class EmployeeLigneIgnoree(ModeleApi):
    numero_ligne: int
    cin: str | None
    nom_prenom: str | None
    raison: str


class EmployeeImportReponse(ModeleApi):
    total_lignes: int
    crees: int
    ignores: int
    lignes_ignorees: list[EmployeeLigneIgnoree]


class FormatDocument(StrEnum):
    """Format d'un document administratif : le PDF à imprimer tel quel, ou le Word à retoucher avant impression."""

    PDF = "PDF"
    WORD = "WORD"


class AttestationTravailRequete(ModeleApi):
    civilite: Civilite
    format: FormatDocument = FormatDocument.PDF


class CnssImportReponse(ModeleApi):
    """Import des déclarations CNSS : atomique, une ligne rejetée refuse tout le fichier."""

    total_lignes: int
    mis_a_jour: int
    inchanges: int
    sans_declaration: int
    ignores: int
    lignes_ignorees: list[EmployeeLigneIgnoree]
