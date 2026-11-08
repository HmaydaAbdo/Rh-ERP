"""Erreurs du domaine audit : mêmes statuts et messages que `AuditExceptionHandler` de Spring."""

from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class EntreeIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, identifiant: int) -> None:
        super().__init__(f"Entrée de journal introuvable avec l'id : {identifiant}")


class EntiteAuditeeInconnue(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, nom: str) -> None:
        super().__init__(f"Entité auditée inconnue : {nom}")


class EntreeNonRestaurable(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, identifiant: int) -> None:
        super().__init__(f"L'entrée d'audit {identifiant} ne correspond pas à une suppression de groupe restaurable.")
