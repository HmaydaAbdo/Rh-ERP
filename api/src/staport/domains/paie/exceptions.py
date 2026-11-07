from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class PaieIntrouvable(ErreurMetier):
    def __init__(self, identifiant: int):
        super().__init__(f"Bulletin de paie introuvable : {identifiant}")


class PaieDejaExistante(ErreurMetier):
    def __init__(self, employee_id: int, periode: int):
        super().__init__(f"Un bulletin existe déjà pour l'employé {employee_id} et la période {periode}")


class PeriodeObligatoire(ErreurMetier):
    def __init__(self) -> None:
        super().__init__("La période est obligatoire pour supprimer un groupe de bulletins (format aaaa-MM)")


class PaieGroupeModifie(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, actuel: int, attendu: int) -> None:
        super().__init__(
            f"Le groupe a changé depuis son affichage : {actuel} bulletin(s) correspondent maintenant, "
            f"{attendu} étaient attendus. Rien n'a été supprimé, actualisez la page."
        )


class PaieGroupeRestaurationConflit(ErreurMetier):
    """Le groupe entier est refusé si un bulletin employé/mois existe déjà ou si une référence n'existe plus."""

    statut = HTTPStatus.CONFLICT

    def __init__(self, conflits: int) -> None:
        super().__init__(
            f"Restauration refusée : {conflits} conflit(s) employé/mois ou référence manquante. "
            "Aucun bulletin n'a été restauré."
        )
