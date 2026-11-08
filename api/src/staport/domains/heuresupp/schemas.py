"""Contrats HTTP des heures supplémentaires, avec les noms JSON historiques du frontend."""

from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, Field

from staport.domains.common.montant import arrondir_si_nombre
from staport.domains.common.schemas import ModeleApi, Nombre, NonVide
from staport.domains.employee.models import TypeSalaire
from staport.domains.paie.periode import PeriodePaie

Heures = Annotated[Decimal, Field(ge=0, max_digits=8, decimal_places=1)]
Forfait = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=0)]


class HeuresSuppCreationRequete(ModeleApi):
    employee_id: int
    periode: PeriodePaie
    chantier_id: int
    heures_supplementaires: Heures | None = None
    forfait_dh: Forfait | None = None


class HeuresSuppModificationRequete(ModeleApi):
    version: int
    heures_supplementaires: Heures | None = None
    forfait_dh: Forfait | None = None


class HeuresSuppRecherche(ModeleApi):
    periode: PeriodePaie | None = None
    chantier_ids: Annotated[list[int], Field(max_length=500)] | None = None
    equipe_ids: Annotated[list[int], Field(max_length=500)] | None = None
    fonction_ids: Annotated[list[int], Field(max_length=500)] | None = None
    cin: Annotated[str, Field(max_length=30)] | None = None
    nom_prenom: Annotated[str, Field(max_length=150)] | None = None
    periodes: Annotated[list[PeriodePaie], Field(max_length=60)] | None = None


class HeuresSuppSuppressionMois(ModeleApi):
    periode: PeriodePaie
    nombre_attendu: Annotated[int, Field(ge=0)]


class HeureSuppReponse(ModeleApi):
    id: int
    version: int
    employee_id: int
    nom_prenom: str
    cin: str
    fonction_id: int
    fonction: str
    chantier_id: int
    code_chantier: str
    chantier: str | None
    periode: PeriodePaie
    salaire_reference_dh: Nombre | None
    type_salaire_reference: TypeSalaire | None
    salaire_horaire_dh: Nombre | None
    heures_supplementaires: Nombre | None
    montant_dh: Nombre
    stc_ou_sortie: bool
    stc_dh: Nombre
    forfait_dh: Nombre | None
    net_a_payer_dh: Nombre


class Indicateurs(ModeleApi):
    employes: int
    lignes_heures: int
    heures: Nombre
    montant_dh: Nombre
    stc_dh: Nombre
    forfait_dh: Nombre
    net_a_payer_dh: Nombre


class Groupe(ModeleApi):
    id: int
    code: str | None
    libelle: str | None
    lignes_heures: int
    effectif: int
    heures: Nombre
    montant_dh: Nombre
    stc_dh: Nombre
    forfait_dh: Nombre
    net_a_payer_dh: Nombre


class Definitions(ModeleApi):
    heures: str
    montant_dh: str
    stc_dh: str
    forfait_dh: str
    net_a_payer_dh: str


class HeuresSuppAnalytique(ModeleApi):
    periode: PeriodePaie | None
    indicateurs: Indicateurs
    par_chantier: list[Groupe]
    par_fonction: list[Groupe]
    par_equipe: list[Groupe]
    definitions: Definitions


def _dans_le_passe(valeur: date) -> date:
    if valeur >= date.today():
        raise ValueError("La date doit être dans le passé.")
    return valeur


class ImportPrerequis(ModeleApi):
    periode: PeriodePaie
    chantier_id: int
    bulletins_disponibles: int
    pret: bool
    message: str | None


class ImportLigne(ModeleApi):
    numero_ligne: int
    cin: str
    nom_prenom: str | None
    fonction: str | None
    employe_id: int | None
    nom_fichier: str | None
    fonction_fichier: str | None
    identite_ecart: bool
    fonction_ecart: bool
    forfait_seul: bool
    heures_supplementaires: Nombre | None
    salaire_horaire_dh: Nombre | None
    montant_dh: Nombre
    stc_ou_sortie: bool
    stc_dh: Nombre
    forfait_dh: Nombre | None
    net_a_payer_dh: Nombre
    erreurs: list[str]


class ImportAnalyse(ModeleApi):
    periode: PeriodePaie
    chantier_id: int
    total_lignes: int
    lignes_zero: int
    lignes: list[ImportLigne]
    erreurs: list[str]
    pret: bool


class ImportResultat(ModeleApi):
    periode: PeriodePaie
    chantier_id: int
    lignes_heures: int
    lignes_zero: int
    forfaits_seuls: int
    remplacements: int
    heures_totales: Nombre
    montant_total_dh: Nombre
    stc_total_dh: Nombre
    forfait_total_dh: Nombre
    net_total_dh: Nombre


class ImportForfait(ModeleApi):
    cin: Annotated[NonVide, Field(max_length=30)]
    montant_dh: Forfait


class ImportForfaits(ModeleApi):
    """Forfaits saisis séparément des lignes P/H, identifiés par le CIN."""

    forfaits: Annotated[list[ImportForfait], Field(max_length=500)] = Field(default_factory=list[ImportForfait])


class ImportAlignement(ModeleApi):
    employe_id: int


class ImportCreation(ModeleApi):
    numero_ligne: int
    date_naissance: Annotated[date, AfterValidator(_dans_le_passe)]
    date_embauche: date
    fonction_id: int
    salaire: Annotated[Decimal, BeforeValidator(arrondir_si_nombre), Field(ge=0, max_digits=10, decimal_places=2)]
    type_salaire: TypeSalaire


class ImportCorrections(ModeleApi):
    aligner: Annotated[list[ImportAlignement], Field(max_length=500)] = Field(default_factory=list[ImportAlignement])
    creer: Annotated[list[ImportCreation], Field(max_length=500)] = Field(default_factory=list[ImportCreation])


class HeuresSuppExportRequete(HeuresSuppRecherche):
    """Filtres, recherche et tri de la vue Tabulaire : l'export couvre toutes les lignes du périmètre."""

    tri: Annotated[str, Field(max_length=60)] | None = None

    def mois_demandes(self) -> list[int]:
        """La liste `periodes` si elle est fournie, sinon le mois unique."""
        if self.periodes:
            return sorted(set(self.periodes))
        return [] if self.periode is None else [self.periode]

    def criteres(self) -> HeuresSuppRecherche:
        return HeuresSuppRecherche.model_validate(self.model_dump(exclude={"tri"}))
