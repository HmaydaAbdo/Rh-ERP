from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class EmployeeIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, i: int):
        super().__init__(f"Employé introuvable avec l'id : {i}")


class EmployeeDejaExistant(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, cin: str):
        super().__init__(f"Un employé existe déjà avec le CIN : {cin}")


class ReferenceInvalide(ErreurMetier):
    """Fonction, chantier ou équipe inexistant (HTTP 400, comme `InvalidReferenceException`)."""

    statut = HTTPStatus.BAD_REQUEST

    def __init__(self, libelle: str, identifiant: int):
        super().__init__(f"{libelle} introuvable avec l'id : {identifiant}")


class EmployeeUtilise(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self):
        super().__init__(
            "Cet employé est lié à au moins un bulletin de paie ou un compte utilisateur et ne peut pas être supprimé. "
            "Passez-le à INACTIF pour conserver son historique."
        )


class ErreurImportEmployee(ErreurMetier):
    """Fichier illisible, vide ou au mauvais format (HTTP 400, comme `EmployeeImportException`)."""
