"""Contrats HTTP du domaine function, avec les noms JSON historiques du frontend."""

from typing import Annotated

from pydantic import Field

from staport.domains.common.schemas import ModeleApi, NonVide, Page


class FonctionCreationRequete(ModeleApi):
    libelle: Annotated[NonVide, Field(max_length=100)]


class FonctionModificationRequete(FonctionCreationRequete):
    version: int


class FonctionRecherche(ModeleApi):
    libelle: Annotated[str | None, Field(max_length=100)] = None


class FonctionReponse(ModeleApi):
    id: int
    version: int
    libelle: str


FonctionsPage = Page[FonctionReponse]
