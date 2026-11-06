from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class EquipeIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, identifiant: int) -> None:
        super().__init__(f"Équipe introuvable avec l'id : {identifiant}")


class EquipeDejaExistante(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, champ: str, valeur: str) -> None:
        super().__init__(f"Une équipe avec le {champ} existe déjà : {valeur}")


class EquipeUtilisee(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self) -> None:
        super().__init__("Cette équipe est encore référencée et ne peut pas être supprimée.")
