"""Transformation des modèles en DTO et calcul des permissions effectives."""

from collections.abc import Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth import repository
from staport.domains.auth.models import Permission, Role, Utilisateur
from staport.domains.auth.schemas import (
    EmployeResume,
    PermissionReponse,
    RoleReponse,
    RoleResume,
    UtilisateurReponse,
)

SYSTEM_ADMIN = "SYSTEM_ADMIN"
"""Nom du rôle que le code connaît (création du premier compte, protection contre la suppression)."""


def permissions_effectives(utilisateur: Utilisateur) -> set[str]:
    """Union des permissions des rôles, moins les refus individuels (le refus individuel l'emporte)."""
    refusees = {p.code for p in utilisateur.permissions_refusees}
    return {p.code for role in utilisateur.roles for p in role.permissions if p.code not in refusees}


def noms_des_roles(utilisateur: Utilisateur) -> set[str]:
    return {role.nom for role in utilisateur.roles}


def permission_reponse(permission: Permission) -> PermissionReponse:
    return PermissionReponse(
        id=permission.id, version=permission.version, code=permission.code, description=permission.description
    )


def _permissions_triees(permissions: Iterable[Permission]) -> list[PermissionReponse]:
    return [permission_reponse(p) for p in sorted(permissions, key=lambda p: p.code)]


def role_reponse(role: Role) -> RoleReponse:
    return RoleReponse(
        id=role.id,
        version=role.version,
        nom=role.nom,
        description=role.description,
        permissions=_permissions_triees(role.permissions),
        protege=role.nom == SYSTEM_ADMIN,
    )


def utilisateur_reponse_avec(utilisateur: Utilisateur, resume_employe: tuple[str, str] | None) -> UtilisateurReponse:
    employe = None
    if utilisateur.employee_id is not None and resume_employe is not None:
        employe = EmployeResume(id=utilisateur.employee_id, nom_prenom=resume_employe[0], cin=resume_employe[1])
    return UtilisateurReponse(
        id=utilisateur.id,
        version=utilisateur.version,
        username=utilisateur.username,
        email=utilisateur.email,
        actif=utilisateur.actif,
        employee=employe,
        roles=[RoleResume(id=r.id, nom=r.nom) for r in sorted(utilisateur.roles, key=lambda r: r.nom)],
        permissions_refusees=_permissions_triees(utilisateur.permissions_refusees),
        permissions_effectives=sorted(permissions_effectives(utilisateur)),
    )


async def utilisateurs_reponses(session: AsyncSession, utilisateurs: Iterable[Utilisateur]) -> list[UtilisateurReponse]:
    """Une seule requête pour les employés de tous les comptes."""
    liste = list(utilisateurs)
    employes = await repository.employes_resumes(session, {u.employee_id for u in liste if u.employee_id is not None})
    return [utilisateur_reponse_avec(u, employes.get(u.employee_id) if u.employee_id else None) for u in liste]


async def utilisateur_reponse(session: AsyncSession, utilisateur: Utilisateur) -> UtilisateurReponse:
    return (await utilisateurs_reponses(session, [utilisateur]))[0]
