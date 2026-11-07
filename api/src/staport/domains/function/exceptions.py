from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class FonctionIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, identifiant: int) -> None:
        super().__init__(f"Fonction introuvable avec l'id : {identifiant}")


class FonctionDejaExistante(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, libelle: str) -> None:
        super().__init__(f"Une fonction avec le libellé existe déjà : {libelle}")


class FonctionUtilisee(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self) -> None:
        super().__init__(
            "Cette fonction est utilisée par au moins un employé ou un bulletin de paie et ne peut pas être supprimée."
        )


class ErreurImportFonction(ErreurMetier):
    """Fichier illisible (HTTP 400, comme `FunctionImportException`) ; une ligne invalide n'en est pas une."""
