"""Contrat des mois de paie : AAAA-MM sur HTTP, AAAAMM dans la base."""

import re
from typing import Annotated, Any

from pydantic import BeforeValidator, PlainSerializer

_MOIS = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


def lire_periode(valeur: Any) -> int:
    if isinstance(valeur, str):
        correspondance = _MOIS.fullmatch(valeur)
        if correspondance is None:
            raise ValueError("La période doit être au format AAAA-MM.")
        periode = int(correspondance[1]) * 100 + int(correspondance[2])
    elif isinstance(valeur, int) and not isinstance(valeur, bool):
        periode = valeur
    else:
        raise ValueError("La période doit être au format AAAA-MM.")
    annee, mois = divmod(periode, 100)
    if not 1900 <= annee <= 2999 or not 1 <= mois <= 12:
        raise ValueError("La période doit être un mois entre 1900-01 et 2999-12.")
    return periode


def afficher_periode(periode: int) -> str:
    annee, mois = divmod(periode, 100)
    return f"{annee:04d}-{mois:02d}"


def mois_suivant(periode: int) -> int:
    annee, mois = divmod(periode, 100)
    return (annee + 1) * 100 + 1 if mois == 12 else annee * 100 + mois + 1


def mois_precedent(periode: int) -> int:
    annee, mois = divmod(periode, 100)
    return (annee - 1) * 100 + 12 if mois == 1 else annee * 100 + mois - 1


PeriodePaie = Annotated[
    int,
    BeforeValidator(lire_periode),
    PlainSerializer(afficher_periode, return_type=str, when_used="json"),
]


MOIS = (
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
)


def mois_en_toutes_lettres(periode: int) -> str:
    """« mars 2026 » pour 202603."""
    annee, mois = divmod(periode, 100)
    return f"{MOIS[mois - 1]} {annee}"
