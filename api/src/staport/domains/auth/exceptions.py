"""Erreurs du domaine auth : statuts et messages identiques à `AuthExceptionHandler` de Spring."""

from http import HTTPStatus

from staport.platform.erreurs import ErreurMetier


class IdentifiantsInvalides(ErreurMetier):
    statut = HTTPStatus.UNAUTHORIZED

    def __init__(self) -> None:
        super().__init__("Identifiants invalides.")


class RefreshTokenInvalide(ErreurMetier):
    statut = HTTPStatus.UNAUTHORIZED

    def __init__(self) -> None:
        super().__init__("Refresh token invalide, expiré ou déjà utilisé.")


class LienReinitialisationInvalide(ErreurMetier):
    statut = HTTPStatus.BAD_REQUEST

    def __init__(self) -> None:
        super().__init__("Lien de réinitialisation invalide, expiré ou déjà utilisé.")


class MotDePasseNonConforme(ErreurMetier):
    statut = HTTPStatus.BAD_REQUEST

    def __init__(self, longueur_min: int) -> None:
        super().__init__(
            f"Mot de passe non conforme : {longueur_min} caractères minimum et différent de l'identifiant."
        )


class PermissionInconnue(ErreurMetier):
    statut = HTTPStatus.BAD_REQUEST

    def __init__(self, identifiants: set[str]) -> None:
        super().__init__("Permission(s) inconnue(s) : " + ", ".join(identifiants))


class ReferenceInvalide(ErreurMetier):
    statut = HTTPStatus.BAD_REQUEST


class UtilisateurIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, cle: int | str) -> None:
        super().__init__(
            f"Utilisateur introuvable avec l'id : {cle}" if isinstance(cle, int) else f"Utilisateur introuvable : {cle}"
        )


class RoleIntrouvable(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self, identifiant: int) -> None:
        super().__init__(f"Rôle introuvable avec l'id : {identifiant}")


class IaDesactivee(ErreurMetier):
    statut = HTTPStatus.NOT_FOUND

    def __init__(self) -> None:
        super().__init__("L'assistant IA n'est pas activé")


class NomUtilisateurDejaPris(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, username: str) -> None:
        super().__init__(f"Ce nom d'utilisateur est déjà utilisé : {username}")


class EmailDejaPris(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, email: str) -> None:
        super().__init__(f"Cet email est déjà utilisé : {email}")


class RoleDejaExistant(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, nom: str) -> None:
        super().__init__(f"Ce rôle existe déjà : {nom}")


class RoleUtilise(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, nom: str, nombre_de_comptes: int) -> None:
        super().__init__(
            f"Le rôle « {nom} » est attribué à {nombre_de_comptes} compte(s) : "
            "retirez-le d'abord de ces comptes avant de le supprimer."
        )


class RoleProtege(ErreurMetier):
    statut = HTTPStatus.CONFLICT

    def __init__(self, nom: str, interdit: str) -> None:
        super().__init__(f"Le rôle « {nom} » est protégé : il ne peut pas être {interdit}.")


class JetonAgentRefuse(ErreurMetier):
    """`AccessDeniedException` de Spring : refus 403 du jeton agent (message générique du gestionnaire global)."""

    statut = HTTPStatus.FORBIDDEN

    def __init__(self) -> None:
        super().__init__("Permission insuffisante pour effectuer cette action.")
