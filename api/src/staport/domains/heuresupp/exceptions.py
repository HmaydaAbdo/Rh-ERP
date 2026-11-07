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
