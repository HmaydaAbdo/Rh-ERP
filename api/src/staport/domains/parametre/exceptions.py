"""Erreurs du domaine parametre : statuts et messages identiques à `ParametreExceptionHandler` de Spring."""

from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class ParametreIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, identifiant: int) -> None:
        super().__init__(f"Paramètre introuvable avec l'id : {identifiant}")


class ParametreInvalide(ErreurMetier):
    statut = HTTPStatus.BAD_REQUEST


class InstallationIncomplete(RuntimeError):
    """Une clé du catalogue n'a pas de ligne en base : aucune valeur de repli ne masque ce cas (réponse 500)."""

    def __init__(self, cle: str) -> None:
        super().__init__(f"Paramètre absent de la table parametre : {cle}")
