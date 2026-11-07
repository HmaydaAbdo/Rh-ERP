"""Contrats HTTP des heures supplémentaires, avec les noms JSON historiques du frontend."""

from decimal import Decimal
from typing import Annotated

from pydantic import Field

from staport.domains.common.schemas import ModeleApi, Nombre
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
