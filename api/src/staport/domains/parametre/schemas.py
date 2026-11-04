"""DTO du domaine parametre : mêmes champs et noms JSON que les `record` Java (contrat du frontend)."""

from typing import Annotated

from pydantic import Field

from staport.domains.common.schemas import ModeleApi, NonVide
from staport.domains.parametre.catalogue import TypeParametre


class ParametreModificationRequete(ModeleApi):
    version: int
    valeur: Annotated[NonVide, Field(max_length=255)]


class ParametreReponse(ModeleApi):
    id: int
    version: int
    cle: str
    libelle: str
    description: str
    type: TypeParametre
    unite: str | None
    minimum: int | None
    maximum: int | None
    valeur: str
