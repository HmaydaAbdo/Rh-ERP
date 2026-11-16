"""DTO du domaine parametre : champs et noms JSON du contrat du frontend."""

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


class OuvertureVueLibreRequete(ModeleApi):
    """Une vue libre sur le point d'être montrée : le journal garde le fil et la taille, jamais le contenu."""

    fil: Annotated[NonVide, Field(max_length=100)]
    octets: Annotated[int, Field(ge=0, le=10_000_000)]
