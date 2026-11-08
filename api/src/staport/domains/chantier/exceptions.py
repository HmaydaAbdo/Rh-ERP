from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class ChantierIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, identifiant: int) -> None:
        super().__init__(f"Chantier introuvable avec l'id : {identifiant}")


class ChantierDejaExistant(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, code: str) -> None:
        super().__init__(f"Un chantier existe déjà avec le code : {code}")


class ChantierUtilise(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self) -> None:
        super().__init__(
            "Ce chantier est utilisé par au moins un employé ou un bulletin de paie et ne peut pas être supprimé."
        )


class ChantierLocalisationInvalide(ErreurMetier):
    statut = HTTPStatus.BAD_REQUEST


class ChantierErpIndisponible(ErreurMetier):
    statut = HTTPStatus.SERVICE_UNAVAILABLE

    def __init__(self) -> None:
        super().__init__("L'ERP des chantiers est indisponible ou a renvoyé une réponse illisible.")
