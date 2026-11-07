from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class EquipeIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, identifiant: int) -> None:
        super().__init__(f"Équipe introuvable avec l'id : {identifiant}")


class EquipeDejaExistante(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, champ: str, valeur: str) -> None:
        super().__init__(f"Une équipe existe déjà avec le {champ} : {valeur}")


class EquipeUtilisee(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self) -> None:
        super().__init__(
            "Cette équipe est utilisée par au moins un bulletin de paie ou un employé et ne peut pas être supprimée."
        )


class ErreurImportEquipe(ErreurMetier):
    """Fichier illisible ou colonnes inattendues (HTTP 400, comme `EquipeImportException`)."""
