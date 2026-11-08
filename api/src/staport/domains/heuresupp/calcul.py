"""Définitions déterministes des montants d'heures supplémentaires (parité de `CalculHeuresSupp`).

Tout est arrondi à l'entier de dirham en HALF_DOWN (exactement 0,5 : on descend), comme `RoundingMode.HALF_DOWN`.
"""

from decimal import ROUND_HALF_DOWN, Decimal

from staport.domains.employee.models import TypeSalaire

ZERO = Decimal(0)
_UN = Decimal(1)
_DIX = Decimal(10)
_DEUX_CENT_SOIXANTE = Decimal(260)


def salaire_horaire(salaire: Decimal, type_salaire: TypeSalaire) -> Decimal:
    """Salaire journalier / 10, ou salaire mensuel / 260 : la valeur arrondie est celle qui est stockée."""
    diviseur = _DIX if type_salaire == TypeSalaire.JOURNALIER else _DEUX_CENT_SOIXANTE
    return (salaire / diviseur).quantize(_UN, rounding=ROUND_HALF_DOWN)


def montant(taux: Decimal | None, heures: Decimal | None) -> Decimal:
    """S/H x P/H arrondi à l'entier ; 0 sans heures."""
    if taux is None or heures is None:
        return ZERO
    return (taux * heures).quantize(_UN, rounding=ROUND_HALF_DOWN)


def stc_dh(montant_ligne: Decimal, stc_ou_sortie: bool) -> Decimal:
    """Le montant en entier pour un bulletin STC/sortie du mois, sinon 0."""
    return montant_ligne if stc_ou_sortie else ZERO


def net_a_payer(montant_ligne: Decimal, stc: Decimal, forfait: Decimal | None) -> Decimal:
    """Montant - STC + forfait (le forfait est distinct du montant)."""
    return montant_ligne - stc + (ZERO if forfait is None else forfait)
