"""Contrats HTTP du domaine accueil, avec les noms JSON historiques du frontend."""

from typing import Annotated

from pydantic import Field

from staport.domains.common.schemas import ModeleApi, NonVide


class AccueilModificationRequete(ModeleApi):
    """Indicateurs à afficher, dans l'ordre ; `version` est celle de la dernière lecture (absente avant tout choix)."""

    version: int | None = None
    indicateurs: Annotated[list[Annotated[NonVide, Field(max_length=50)]], Field(max_length=20)]


class IndicateurDisponible(ModeleApi):
    code: str
    libelle: str
    description: str


class AccueilReponse(ModeleApi):
    version: int | None
    personnalise: bool
    indicateurs: list[str]
    disponibles: list[IndicateurDisponible]
