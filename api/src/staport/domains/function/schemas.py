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


class FonctionLigneIgnoree(ModeleApi):
    numero_ligne: int
    libelle: str
    raison: str


class FonctionImportReponse(ModeleApi):
    total_lignes: int
    crees: int
    ignores: int
    lignes_ignorees: list[FonctionLigneIgnoree]
