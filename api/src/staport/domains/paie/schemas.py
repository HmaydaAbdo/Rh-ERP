from decimal import Decimal
from typing import Annotated

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
