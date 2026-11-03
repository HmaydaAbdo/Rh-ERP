"""Accès aux données du domaine auth (SQLAlchemy 2.x asynchrone). Aucune règle métier ici."""

from collections.abc import Sequence

from sqlalchemy import ColumnElement, Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import QueryableAttribute, selectinload

from staport.domains.auth.models import (
    Permission,
    RefreshToken,
    ResetPasswordToken,
    Role,
    Utilisateur,
    employe,
    utilisateur_role,
)
from staport.domains.common.pagination import Pagination
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient

_CHARGEMENT_UTILISATEUR = (
    selectinload(Utilisateur.roles).selectinload(Role.permissions),
    selectinload(Utilisateur.permissions_refusees),
)


def _normalise(colonne: QueryableAttribute[str], valeur: str) -> ColumnElement[bool]:
    """`upper(trim(colonne)) = upper(trim(valeur))`, comme les requêtes JPQL de Spring (index V27)."""
    return func.upper(func.trim(colonne)) == valeur.strip().upper()


def _trier[T](requete: Select[T], modele: type[T], pagination: Pagination) -> Select[T]:
    for champ, croissant in pagination.tri:
        colonne = getattr(modele, champ)
        requete = requete.order_by(colonne.asc() if croissant else colonne.desc())
    return requete.order_by(modele.id.asc())  # type: ignore[attr-defined]  # ordre total : pages stables


# --- Utilisateurs ---------------------------------------------------------------------------------


async def utilisateur_par_id(session: AsyncSession, identifiant: int) -> Utilisateur | None:
    requete = select(Utilisateur).where(Utilisateur.id == identifiant).options(*_CHARGEMENT_UTILISATEUR)
    return (await session.execute(requete)).scalar_one_or_none()


async def utilisateur_par_username_verrou(session: AsyncSession, username: str) -> Utilisateur | None:
    requete = (
        select(Utilisateur)
        .where(_normalise(Utilisateur.username, username))
        .options(*_CHARGEMENT_UTILISATEUR)
        .with_for_update(of=Utilisateur)
    )
    return (await session.execute(requete)).scalar_one_or_none()


async def utilisateur_par_username(session: AsyncSession, username: str) -> Utilisateur | None:
    requete = (
        select(Utilisateur)
        .where(func.lower(Utilisateur.username) == username.lower())
        .options(*_CHARGEMENT_UTILISATEUR)
    )
    return (await session.execute(requete)).scalar_one_or_none()


async def utilisateur_par_email(session: AsyncSession, email: str) -> Utilisateur | None:
    requete = select(Utilisateur).where(_normalise(Utilisateur.email, email)).options(*_CHARGEMENT_UTILISATEUR)
    return (await session.execute(requete)).scalar_one_or_none()


async def username_existe(session: AsyncSession, username: str) -> bool:
    requete = select(func.count()).select_from(Utilisateur).where(func.lower(Utilisateur.username) == username.lower())
    return (await session.execute(requete)).scalar_one() > 0


async def email_existe(session: AsyncSession, email: str) -> bool:
    requete = select(func.count()).select_from(Utilisateur).where(func.lower(Utilisateur.email) == email.lower())
    return (await session.execute(requete)).scalar_one() > 0


async def admin_existe(session: AsyncSession, nom_role: str) -> bool:
    requete = (
        select(func.count())
        .select_from(utilisateur_role)
        .join(Role, Role.id == utilisateur_role.c.role_id)
        .where(Role.nom == nom_role)
    )
    return (await session.execute(requete)).scalar_one() > 0


async def comptes_du_role(session: AsyncSession, role_id: int) -> int:
    requete = select(func.count()).select_from(utilisateur_role).where(utilisateur_role.c.role_id == role_id)
    return (await session.execute(requete)).scalar_one()


async def rechercher_utilisateurs(
    session: AsyncSession, username: str | None, email: str | None, actif: bool | None, pagination: Pagination
) -> tuple[Sequence[Utilisateur], int]:
    filtres: list[ColumnElement[bool]] = []
    if username and username.strip():
        filtres.append(func.lower(Utilisateur.username).like(motif_contient(username), escape=ECHAPPEMENT))
    if email and email.strip():
        filtres.append(func.lower(Utilisateur.email).like(motif_contient(email), escape=ECHAPPEMENT))
    if actif is not None:
        filtres.append(Utilisateur.actif == actif)
    total = (await session.execute(select(func.count()).select_from(Utilisateur).where(*filtres))).scalar_one()
    requete = _trier(select(Utilisateur).where(*filtres).options(*_CHARGEMENT_UTILISATEUR), Utilisateur, pagination)
    lignes = (await session.execute(requete.limit(pagination.taille).offset(pagination.decalage))).scalars().all()
    return lignes, total


async def employes_resumes(session: AsyncSession, identifiants: set[int]) -> dict[int, tuple[str, str]]:
    """`{id: (nom_prenom, cin)}` des employés demandés."""
    if not identifiants:
        return {}
    requete = select(employe.c.id, employe.c.nom_prenom, employe.c.cin).where(employe.c.id.in_(identifiants))
    return {ligne.id: (ligne.nom_prenom, ligne.cin) for ligne in (await session.execute(requete)).all()}


async def employe_existe(session: AsyncSession, identifiant: int) -> bool:
    requete = select(func.count()).select_from(employe).where(employe.c.id == identifiant)
    return (await session.execute(requete)).scalar_one() > 0


# --- Rôles et permissions -------------------------------------------------------------------------


async def role_par_id(session: AsyncSession, identifiant: int) -> Role | None:
    requete = select(Role).where(Role.id == identifiant).options(selectinload(Role.permissions))
    return (await session.execute(requete)).scalar_one_or_none()


async def roles_par_ids(session: AsyncSession, identifiants: set[int]) -> Sequence[Role]:
    requete = select(Role).where(Role.id.in_(identifiants)).options(selectinload(Role.permissions))
    return (await session.execute(requete)).scalars().all()


async def tous_les_roles(session: AsyncSession) -> Sequence[Role]:
    requete = select(Role).order_by(Role.nom.asc()).options(selectinload(Role.permissions))
    return (await session.execute(requete)).scalars().all()


async def role_existe_par_nom(session: AsyncSession, nom: str) -> bool:
    requete = select(func.count()).select_from(Role).where(func.lower(Role.nom) == nom.lower())
    return (await session.execute(requete)).scalar_one() > 0


async def rechercher_roles(
    session: AsyncSession, nom: str | None, description: str | None, pagination: Pagination
) -> tuple[Sequence[Role], int]:
    filtres: list[ColumnElement[bool]] = []
    if nom and nom.strip():
        filtres.append(func.lower(Role.nom).like(motif_contient(nom), escape=ECHAPPEMENT))
    if description and description.strip():
        filtres.append(func.lower(Role.description).like(motif_contient(description), escape=ECHAPPEMENT))
    total = (await session.execute(select(func.count()).select_from(Role).where(*filtres))).scalar_one()
    requete = _trier(select(Role).where(*filtres).options(selectinload(Role.permissions)), Role, pagination)
    lignes = (await session.execute(requete.limit(pagination.taille).offset(pagination.decalage))).scalars().all()
    return lignes, total


async def permissions_par_ids(session: AsyncSession, identifiants: set[int]) -> Sequence[Permission]:
    requete = select(Permission).where(Permission.id.in_(identifiants))
    return (await session.execute(requete)).scalars().all()


async def toutes_les_permissions(session: AsyncSession) -> Sequence[Permission]:
    return (await session.execute(select(Permission).order_by(Permission.code.asc()))).scalars().all()


# --- Jetons ---------------------------------------------------------------------------------------


async def refresh_par_empreinte(session: AsyncSession, empreinte: str) -> RefreshToken | None:
    return (
        await session.execute(select(RefreshToken).where(RefreshToken.token_hash == empreinte))
    ).scalar_one_or_none()


async def refresh_actifs_de_la_famille(session: AsyncSession, famille: str) -> Sequence[RefreshToken]:
    requete = select(RefreshToken).where(RefreshToken.famille == famille, RefreshToken.revoque.is_(False))
    return (await session.execute(requete)).scalars().all()


async def refresh_actifs_de_l_utilisateur(session: AsyncSession, utilisateur_id: int) -> Sequence[RefreshToken]:
    requete = select(RefreshToken).where(RefreshToken.utilisateur_id == utilisateur_id, RefreshToken.revoque.is_(False))
    return (await session.execute(requete)).scalars().all()


async def reinitialisation_par_empreinte(session: AsyncSession, empreinte: str) -> ResetPasswordToken | None:
    requete = select(ResetPasswordToken).where(ResetPasswordToken.token_hash == empreinte)
    return (await session.execute(requete)).scalar_one_or_none()
