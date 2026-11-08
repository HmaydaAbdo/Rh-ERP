from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class HeuresSuppInvalide(ErreurMetier):
    """Saisie refusée (HTTP 400, comme `HeuresSuppImportException`, utilisée aussi pour « introuvable »)."""


class HeuresSuppGroupeModifie(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, actuel: int, confirme: int) -> None:
        super().__init__(
            f"Le mois contient maintenant {actuel} lignes au lieu des {confirme} confirmées. "
            "Aucune ligne n'a été supprimée ; actualisez puis recommencez."
        )


class LigneIntrouvable(HeuresSuppInvalide):
    def __init__(self) -> None:
        super().__init__("La ligne d'heures supplémentaires demandée n'existe pas.")


class InvalidHeuresSuppPeriode(ErreurMetier):
    def __init__(self, periode: str) -> None:
        super().__init__(f"Période invalide, format attendu aaaa-MM (ex. 2026-10) : {periode}")
