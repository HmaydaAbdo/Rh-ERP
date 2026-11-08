"""Règle commune des montants : deux décimales, arrondi « demi supérieur », appliqué automatiquement partout."""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

DEUX_DECIMALES = Decimal("0.01")
# Au-delà, l'arrondi à deux décimales dépasse la capacité NUMERIC(10,2) : la valeur est laissée telle quelle et refusée.
_SEUIL_ARRONDI = Decimal("99999999.995")


def arrondir_montant(valeur: Decimal) -> Decimal:
    """Arrondit à deux décimales (0,005 → 0,01) ; les valeurs non finies ou hors capacité restent intactes."""
    if not valeur.is_finite() or abs(valeur) >= _SEUIL_ARRONDI:
        return valeur
    return valeur.quantize(DEUX_DECIMALES, rounding=ROUND_HALF_UP)


def arrondir_si_nombre(valeur: Any) -> Any:
    """Validateur « avant » des types pydantic : arrondit un nombre ou un texte numérique, le reste va à pydantic."""
    if isinstance(valeur, bool) or not isinstance(valeur, int | float | Decimal | str):
        return valeur
    try:
        nombre = valeur if isinstance(valeur, Decimal) else Decimal(str(valeur).strip())
    except InvalidOperation:
        return valeur
    return arrondir_montant(nombre)
