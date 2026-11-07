from datetime import date
from enum import StrEnum
from typing import Annotated

from pydantic import Field, model_validator

from staport.domains.common.schemas import ModeleApi, Nombre, NonVide, Page

from .models import EmployeeStatut, TypeSalaire


class EmployeeCreationRequete(ModeleApi):
    nom_prenom: Annotated[NonVide, Field(max_length=150)]
    cin: Annotated[NonVide, Field(max_length=30)]
    date_naissance: date
    date_embauche: date
    fonction_id: int
    chantier_id: int | None
    equipe_id: int | None = None
    salaire: Nombre | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    type_salaire: TypeSalaire | None = None

    @model_validator(mode="after")
    def salaire_ensemble(self):
        if (self.salaire is None) != (self.type_salaire is None):
            raise ValueError("le salaire et son type se renseignent ensemble")
        if self.date_naissance >= date.today():
            raise ValueError("la date de naissance doit être passée")
        if self.chantier_id is None:
            raise ValueError("un employé actif doit avoir un chantier")
        return self


class EmployeeModificationRequete(EmployeeCreationRequete):
    version: int
    chantier_id: int | None = None
    statut: EmployeeStatut

    @model_validator(mode="after")
    def affectations(self):
        if self.statut is EmployeeStatut.ACTIF and self.chantier_id is None:
            raise ValueError("un employé actif doit avoir un chantier")
        if self.statut is EmployeeStatut.INACTIF and (self.chantier_id is not None or self.equipe_id is not None):
            raise ValueError("un employé inactif ne garde ni chantier ni équipe")
        return self


class EmployeeRecherche(ModeleApi):
    nom_prenom: Annotated[str | None, Field(max_length=150)] = None
    cin: Annotated[str | None, Field(max_length=30)] = None
    fonction_ids: list[int] | None = None
    chantier_ids: list[int] | None = None
    equipe_ids: list[int] | None = None
    statut: EmployeeStatut | None = None


class EmployeeReponse(ModeleApi):
    id: int
    version: int
    nom_prenom: str
    cin: str
    date_naissance: date
    date_embauche: date
    fonction_id: int
    chantier_id: int | None
    equipe_id: int | None
    salaire: Nombre | None
    type_salaire: TypeSalaire | None
    statut: EmployeeStatut


EmployeesPage = Page[EmployeeReponse]


class DimensionEmployes(StrEnum):
    CHANTIER = "CHANTIER"
    EQUIPE = "EQUIPE"
    FONCTION = "FONCTION"


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


class EmployeeSortieReponse(ModeleApi):
    employe_id: int
    periode: int
    motif: str


class EmployeeSortiesMoisReponse(ModeleApi):
    periode: int
    nombre: int
    par_motif: dict[str, int]
    sorties: list[EmployeeSortieReponse]


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
