from staport.platform.erreurs import ErreurMetier


class PaieIntrouvable(ErreurMetier):
    def __init__(self, identifiant: int):
        super().__init__(f"Bulletin de paie introuvable : {identifiant}")


class PaieDejaExistante(ErreurMetier):
    def __init__(self, employee_id: int, periode: int):
        super().__init__(f"Un bulletin existe déjà pour l'employé {employee_id} et la période {periode}")
