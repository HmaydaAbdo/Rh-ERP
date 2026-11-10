from typing import Annotated

from pydantic import Field

from staport.domains.common.schemas import Coordonnee, ModeleApi, Nombre, NonVide, Page

from .models import NatureChantier


class ChantierCreationRequete(ModeleApi):
    code: Annotated[NonVide, Field(max_length=100)]
    designation: Annotated[NonVide, Field(max_length=500)]
    nom: Annotated[str | None, Field(max_length=255)] = None
    nature: NatureChantier
    localisation: Annotated[str | None, Field(max_length=2048)] = None
    latitude: Coordonnee | None = Field(default=None, ge=-90, le=90, max_digits=11, decimal_places=8)
    longitude: Coordonnee | None = Field(default=None, ge=-180, le=180, max_digits=11, decimal_places=8)
    afficher_sur_carte: bool


class ChantierModificationRequete(ChantierCreationRequete):
    version: int
    actif: bool


class ChantierStatutRequete(ModeleApi):
    version: int
    actif: bool


class ChantierRecherche(ModeleApi):
    code: Annotated[str | None, Field(max_length=100)] = None
    designation: Annotated[str | None, Field(max_length=500)] = None
    recherche: Annotated[str | None, Field(max_length=500)] = None
    actif: bool | None = None


class ChantierReponse(ModeleApi):
    id: int
    version: int
    code: str
    designation: str | None
    nom: str | None
    source_erp: bool
    actif: bool
    nature: NatureChantier | None
    localisation: str | None
    latitude: Nombre | None
    longitude: Nombre | None
    afficher_sur_carte: bool


class ChantierCarteReponse(ModeleApi):
    id: int
    code: str
    designation: str | None
    nom: str | None
    nature: NatureChantier | None
    localisation: str | None
    latitude: Nombre | None
    longitude: Nombre | None


class SynchronisationReponse(ModeleApi):
    total_recus: int
    crees: int
    deja_presents: int
    ignores: int


ChantiersPage = Page[ChantierReponse]
