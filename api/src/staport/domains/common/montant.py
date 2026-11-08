"""Règle commune des montants : entiers de dirham, 0,5 inclus on descend, au-delà on monte (HALF_DOWN), partout."""

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


def arrondir_si_nombre(valeur: Any) -> Any:
    """Validateur « avant » des types pydantic : arrondit un nombre ou un texte numérique, le reste va à pydantic."""
    if isinstance(valeur, bool) or not isinstance(valeur, int | float | Decimal | str):
        return valeur
    try:
        nombre = valeur if isinstance(valeur, Decimal) else Decimal(str(valeur).strip())
    except InvalidOperation:
        return valeur
    return arrondir_montant(nombre)
