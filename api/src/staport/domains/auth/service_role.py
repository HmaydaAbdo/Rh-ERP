"""Rôles et catalogue des permissions (parité avec `RoleService` de Spring)."""

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth import repository
from staport.domains.auth.exceptions import RoleDejaExistant, RoleIntrouvable, RoleProtege, RoleUtilise
from staport.domains.auth.mappage import SYSTEM_ADMIN, permission_reponse, role_reponse
from staport.domains.auth.models import Permission, Role
from staport.domains.auth.schemas import (
    PermissionReponse,
    RoleCreationRequete,
    RoleModificationRequete,
    RoleRecherche,
    RoleReponse,
)
from staport.domains.auth.service_utilisateur import resoudre_permissions
from staport.domains.common.audit_contexte import TypeOperation, auditer
from staport.domains.common.optimiste import incrementer_version, verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page


class ServiceRole:
    async def rechercher(
        self, session: AsyncSession, criteres: RoleRecherche | None, pagination: Pagination
    ) -> Page[RoleReponse]:
        c = criteres or RoleRecherche()
        async with session.begin():
            lignes, total = await repository.rechercher_roles(session, c.nom, c.description, pagination)
            contenu = [role_reponse(r) for r in lignes]
        return creer_page(contenu, pagination.taille, pagination.page, total)

    async def lire(self, session: AsyncSession, identifiant: int) -> RoleReponse:
        async with session.begin():
            return role_reponse(await self._obtenir(session, identifiant))

    async def creer(self, session: AsyncSession, requete: RoleCreationRequete) -> RoleReponse:
        async with session.begin():
            if await repository.role_existe_par_nom(session, requete.nom):
                raise RoleDejaExistant(requete.nom)
            role = Role(nom=requete.nom, description=requete.description)
            role.permissions = await resoudre_permissions(session, requete.permission_ids)
            with auditer("ROLE_CREATION", TypeOperation.CREATE, "Role"):
                session.add(role)
                await session.flush()
            return role_reponse(role)

    async def modifier(self, session: AsyncSession, identifiant: int, requete: RoleModificationRequete) -> RoleReponse:
        async with session.begin():
            role = await self._obtenir(session, identifiant)
            verifier_version(requete.version, role.version)
            permissions = await resoudre_permissions(session, requete.permission_ids)
            if role.nom == SYSTEM_ADMIN:
                self._garantir_administration_intacte(role, requete.nom, permissions)
            for existant in await repository.tous_les_roles(session):
                if existant.nom.strip().lower() == requete.nom.lower() and existant.id != identifiant:
                    raise RoleDejaExistant(requete.nom)
            with auditer("ROLE_MODIFICATION", TypeOperation.UPDATE, "Role"):
                role.nom = requete.nom
                role.description = requete.description
                role.permissions = permissions
                incrementer_version(role)
                await session.flush()
            return role_reponse(role)

    async def supprimer(self, session: AsyncSession, identifiant: int) -> None:
        async with session.begin():
            role = await self._obtenir(session, identifiant)
            if role.nom == SYSTEM_ADMIN:
                raise RoleProtege(role.nom, "supprimé")
            comptes = await repository.comptes_du_role(session, identifiant)
            if comptes > 0:
                raise RoleUtilise(role.nom, comptes)
            with auditer("ROLE_SUPPRESSION", TypeOperation.DELETE, "Role"):
                await session.delete(role)
                await session.flush()

    async def lister_permissions(self, session: AsyncSession) -> list[PermissionReponse]:
        async with session.begin():
            return [permission_reponse(p) for p in await repository.toutes_les_permissions(session)]

    @staticmethod
    def _garantir_administration_intacte(role: Role, nouveau_nom: str, nouvelles: set[Permission]) -> None:
        if role.nom != nouveau_nom:
            raise RoleProtege(role.nom, "renommé")
        if not {p.id for p in role.permissions} <= {p.id for p in nouvelles}:
            raise RoleProtege(role.nom, "privé de permissions")

    @staticmethod
    async def _obtenir(session: AsyncSession, identifiant: int) -> Role:
        role = await repository.role_par_id(session, identifiant)
        if role is None:
            raise RoleIntrouvable(identifiant)
        return role
