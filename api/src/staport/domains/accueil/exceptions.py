from staport.platform.erreurs import ErreurMetier


class AccueilInvalide(ErreurMetier):
    """Indicateur inconnu, en double ou non autorisé (HTTP 400, comme `AccueilInvalideException`)."""
