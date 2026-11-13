"""Arrondi HALF_DOWN partagé : montants en dirhams et valeurs numériques métier entières."""

from decimal import ROUND_HALF_DOWN, Decimal, InvalidOperation
from typing import Any

UN = Decimal(1)
# Au-delà, l'arrondi à l'entier dépasse la capacité NUMERIC(10,0) : la valeur est laissée telle quelle et refusée.
_SEUIL_ARRONDI = Decimal("9999999999.5")


def arrondir_montant(valeur: Decimal) -> Decimal:
    """Arrondit à l'entier de dirham (0,5 → 0, 0,51 → 1) ; les valeurs non finies ou hors capacité restent intactes."""
    if not valeur.is_finite() or abs(valeur) >= _SEUIL_ARRONDI:
        return valeur
    return valeur.quantize(UN, rounding=ROUND_HALF_DOWN)


def arrondir_entier(valeur: Decimal) -> Decimal:
    """Arrondit tout nombre métier fini à l'entier, sans limite de capacité propre aux montants."""
    if not valeur.is_finite():
        return valeur
    try:
        return valeur.quantize(UN, rounding=ROUND_HALF_DOWN)
    except InvalidOperation:
        return valeur


def serialiser_entier(valeur: Decimal) -> int:
    """Sérialise aussi les nombres calculés en appliquant HALF_DOWN avant leur sortie JSON."""
    return int(arrondir_entier(valeur))


def arrondir_si_nombre(valeur: Any) -> Any:
    """Validateur « avant » des types pydantic : arrondit un nombre ou un texte numérique, le reste va à pydantic."""
    if isinstance(valeur, bool) or not isinstance(valeur, int | float | Decimal | str):
        return valeur
    try:
        nombre = valeur if isinstance(valeur, Decimal) else Decimal(str(valeur).strip())
    except InvalidOperation:
        return valeur
    return arrondir_entier(nombre)


def formater_nombre(valeur: Decimal | None) -> str:
    """Format français d'une valeur métier entière (espace des milliers) ; « — » sans valeur."""
    if valeur is None:
        return "—"
    return f"{arrondir_montant(valeur):,.0f}".replace(",", " ")
