# La boîte à outils A2UI ne publie pas de stubs : seule cette règle est levée, et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false
"""Vérificateur de chiffres (docs/ia.md, § 4) : chaque nombre d'une réponse doit venir des outils du même run.

Le modèle ne calcule pas. Une réponse qui contient un nombre absent des résultats d'outils (et de la question) est
refusée : un total, un écart ou un pourcentage recalculé par le modèle est donc rejeté, même s'il est juste.
"""

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, cast

from ag_ui_a2ui_toolkit import A2UI_OPERATIONS_KEY

# Nombre « à la française » ou « à l'anglaise » : 3 000,50 · 3000.50 · 3000 · 12,5. Les séparateurs de milliers sont
# des espaces (normale, insécable, fine insécable) ; la virgule et le point sont décimaux.
_SEPARATEURS_MILLIERS = " \u00a0\u202f"
_NOMBRE = re.compile(r"\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?")


@dataclass(frozen=True)
class Verification:
    conforme: bool
    nombres_inconnus: tuple[str, ...]


def extraire_nombres(texte: str) -> list[Decimal]:
    """Les nombres d'un texte, normalisés (valeur absolue : un signe ou un tiret n'est pas un chiffre différent)."""
    nombres: list[Decimal] = []
    for brut in _NOMBRE.findall(texte):
        valeur = _decimal(brut)
        if valeur is not None:
            nombres.append(valeur)
    return nombres


def nombres_autorises(sources: Iterable[Any]) -> set[Decimal]:
    """Tous les nombres présents dans des données d'outils (valeurs numériques et nombres écrits dans les textes)."""
    autorises: set[Decimal] = set()
    for source in sources:
        _collecter(source, autorises)
    return autorises


def verifier(reponse: str, sources: Iterable[Any], question: str = "") -> Verification:
    """Conforme si chaque nombre de la réponse figure dans les sources ou dans la question de l'utilisateur."""
    autorises = nombres_autorises(sources) | set(extraire_nombres(question))
    inconnus: list[str] = []
    for brut in _NOMBRE.findall(reponse):
        valeur = _decimal(brut)
        if valeur is not None and valeur not in autorises and brut not in inconnus:
            inconnus.append(brut)
    return Verification(conforme=not inconnus, nombres_inconnus=tuple(inconnus))


# Clés techniques d'une enveloppe A2UI (version, identifiants, liaisons, mise en forme) : jamais des valeurs affichées.
_CLES_TECHNIQUES = frozenset(
    {
        "version",
        "id",
        "component",
        "child",
        "children",
        "path",
        "surfaceId",
        "catalogId",
        "theme",
        "variant",
        "usageHint",
        "weight",
        "action",
        "attachDataModel",
    }
)


def valeurs_surface(enveloppe: str) -> str:
    """Les valeurs qu'affiche une surface A2UI (données du modèle de données et textes des composants), une par ligne,
    pour les vérifier comme le texte d'une réponse. Une enveloppe illisible n'affiche rien."""
    try:
        operations: Any = json.loads(enveloppe).get(A2UI_OPERATIONS_KEY)
    except (ValueError, AttributeError):
        return ""
    valeurs: list[str] = []
    _feuilles(operations, valeurs)
    return "\n".join(valeurs)


def _feuilles(valeur: Any, valeurs: list[str]) -> None:
    if isinstance(valeur, dict):
        for cle, element in cast(dict[str, Any], valeur).items():
            if cle not in _CLES_TECHNIQUES:
                _feuilles(element, valeurs)
    elif isinstance(valeur, list):
        for element in cast(list[Any], valeur):
            _feuilles(element, valeurs)
    elif isinstance(valeur, str | int | float) and not isinstance(valeur, bool):
        valeurs.append(str(valeur))


def _collecter(valeur: Any, autorises: set[Decimal]) -> None:
    if isinstance(valeur, bool) or valeur is None:
        return
    if isinstance(valeur, int | float | Decimal):
        nombre = _decimal(str(valeur))
        if nombre is not None:
            autorises.add(nombre)
    elif isinstance(valeur, str):
        autorises.update(extraire_nombres(valeur))
    elif isinstance(valeur, dict):
        for element in valeur.values():  # pyright: ignore[reportUnknownVariableType]
            _collecter(element, autorises)
    elif isinstance(valeur, list | tuple):
        for element in valeur:  # pyright: ignore[reportUnknownVariableType]
            _collecter(element, autorises)


def _decimal(brut: str) -> Decimal | None:
    texte = brut.strip().lstrip("+-")
    for separateur in _SEPARATEURS_MILLIERS:
        texte = texte.replace(separateur, "")
    texte = texte.replace(",", ".")
    try:
        valeur = Decimal(texte)
    except InvalidOperation:
        return None
    # 3000.00, 3000 et 3 000,0 sont la même valeur.
    return valeur.normalize() if valeur != 0 else Decimal(0)
