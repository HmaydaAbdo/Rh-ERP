from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class EmployeeIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, i: int):
        super().__init__(f"Employé introuvable avec l'id : {i}")


class EmployeeDejaExistant(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, cin: str):
        super().__init__(f"Un employé avec le CIN existe déjà : {cin}")


class EmployeeUtilise(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self):
        super().__init__("Cet employé est encore référencé et ne peut pas être supprimé.")


class ErreurImportEmployee(ErreurMetier):
    """Fichier illisible, vide ou au mauvais format (HTTP 400, comme `EmployeeImportException`)."""
