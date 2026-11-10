"""Schémas partagés : base des DTO (JSON en camelCase, comme Spring) et page de résultats (`VIA_DTO` de Spring Data)."""

import re
from decimal import Decimal
from math import ceil
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

from .montant import arrondir_si_nombre

_COURRIEL = re.compile(r"^[^@\s]+@[^@\s]+$")


def _non_vide(valeur: str) -> str:
    if not valeur.strip():
        raise PydanticCustomError("non_vide", "Ce champ ne doit pas être vide.")
    return valeur


def _courriel(valeur: str) -> str:
    if not _COURRIEL.match(valeur):
        raise PydanticCustomError("courriel_invalide", "Doit être une adresse électronique valide.")
    return valeur


def regle_metier(champ: str, message: str) -> PydanticCustomError:
    """Règle d'un `@AssertTrue` de Spring : l'erreur se rapporte à la propriété `champ`, pas à un champ saisi."""
    return PydanticCustomError("regle_metier", message, {"champ": champ})  # pyright: ignore


NonVide = Annotated[str, AfterValidator(_non_vide)]
"""Équivalent de `@NotBlank` : au moins un caractère qui n'est pas une espace."""

Courriel = Annotated[str, AfterValidator(_non_vide), AfterValidator(_courriel)]
"""Équivalent de `@NotBlank @Email` (syntaxe tolérante comme Hibernate Validator : `local@domaine`)."""


Nombre = Annotated[
    Decimal, BeforeValidator(arrondir_si_nombre), PlainSerializer(int, return_type=int, when_used="json")
]
"""Valeur numérique métier arrondie à l'entier (HALF_DOWN) à l'entrée et à la sortie."""

Coordonnee = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]
"""Décimal géographique exact : latitude et longitude ne suivent pas la règle des entiers métier."""

Montant = Nombre
"""Montant d'argent : arrondi automatiquement à l'entier de dirham (`common/montant.py`) avant les contraintes."""


class ModeleApi(BaseModel):
    """Base de tout DTO : attributs Python en snake_case, JSON en camelCase (contrat du frontend)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class InfoPage(ModeleApi):
    size: int
    number: int
    total_elements: int
    total_pages: int


class Page[T](ModeleApi):
    """`{content, page: {size, number, totalElements, totalPages}}`, forme de `PageSerializationMode.VIA_DTO`."""

    content: list[T]
    page: InfoPage


def creer_page[T](contenu: list[T], taille: int, numero: int, total: int) -> Page[T]:
    return Page[T](
        content=contenu,
        page=InfoPage(size=taille, number=numero, total_elements=total, total_pages=ceil(total / taille)),
    )
