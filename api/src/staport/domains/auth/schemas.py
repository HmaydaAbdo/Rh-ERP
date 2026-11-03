"""DTO du domaine auth : mêmes champs, contraintes et noms JSON que les `record` Java (contrat du frontend)."""

from typing import Annotated, Any

from pydantic import BeforeValidator, Field, PositiveInt

from staport.domains.common.schemas import Courriel, ModeleApi, NonVide


def _strip(valeur: Any) -> Any:
    return valeur.strip() if isinstance(valeur, str) else valeur


Rogne = Annotated[str, BeforeValidator(_strip)]
"""Les constructeurs compacts Java retirent les espaces extérieurs avant la validation."""

Identifiants = set[PositiveInt]


# --- Requêtes -------------------------------------------------------------------------------------


class LoginRequete(ModeleApi):
    username: NonVide
    password: NonVide


class OubliMotDePasseRequete(ModeleApi):
    email: Courriel


class ReinitialisationRequete(ModeleApi):
    token: NonVide
    nouveau_mot_de_passe: Annotated[NonVide, Field(max_length=100)]


class ReinitialisationAdminRequete(ModeleApi):
    nouveau_mot_de_passe: Annotated[NonVide, Field(max_length=100)]


class RoleCreationRequete(ModeleApi):
    nom: Annotated[Rogne, Field(min_length=2, max_length=50)]
    description: Annotated[str | None, Field(max_length=255)] = None
    permission_ids: Identifiants


class RoleModificationRequete(RoleCreationRequete):
    version: int


class RoleRecherche(ModeleApi):
    nom: Annotated[str | None, Field(max_length=50)] = None
    description: Annotated[str | None, Field(max_length=255)] = None


class UtilisateurCreationRequete(ModeleApi):
    username: Annotated[Rogne, Field(min_length=3, max_length=50)]
    email: Annotated[Rogne, Field(max_length=255), Courriel]
    mot_de_passe: Annotated[NonVide, Field(max_length=100)]
    employee_id: int | None = None
    role_ids: Identifiants


class UtilisateurModificationRequete(ModeleApi):
    version: int
    email: Annotated[Rogne, Field(max_length=255), Courriel]
    actif: bool
    employee_id: int | None = None
    role_ids: Identifiants


class RefusPermissionsRequete(ModeleApi):
    version: int
    permission_ids: Identifiants


class UtilisateurRecherche(ModeleApi):
    username: Annotated[str | None, Field(max_length=50)] = None
    email: Annotated[str | None, Field(max_length=255)] = None
    actif: bool | None = None


# --- Réponses -------------------------------------------------------------------------------------


class EmployeResume(ModeleApi):
    id: int
    nom_prenom: str
    cin: str


class PermissionReponse(ModeleApi):
    id: int
    version: int
    code: str
    description: str


class RoleResume(ModeleApi):
    id: int
    nom: str


class RoleReponse(ModeleApi):
    id: int
    version: int
    nom: str
    description: str | None
    permissions: list[PermissionReponse]
    protege: bool


class UtilisateurReponse(ModeleApi):
    id: int
    version: int
    username: str
    email: str
    actif: bool
    employee: EmployeResume | None
    roles: list[RoleResume]
    permissions_refusees: list[PermissionReponse]
    permissions_effectives: list[str]


class ConnexionReponse(ModeleApi):
    access_token: str
    utilisateur: UtilisateurReponse


class PolitiqueMotDePasse(ModeleApi):
    longueur_minimale: int


class JetonAgentReponse(ModeleApi):
    jeton: str
    type_jeton: str
    expire_dans_secondes: int
