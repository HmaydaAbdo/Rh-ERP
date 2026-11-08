"""Comptes utilisateurs (parité avec `UserService` de Spring)."""

from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth import repository
from staport.domains.auth.exceptions import (
    EmailDejaPris,
    NomUtilisateurDejaPris,
    PermissionInconnue,
    ReferenceInvalide,
    RoleIntrouvable,
    UtilisateurIntrouvable,
)
from staport.domains.auth.mappage import SYSTEM_ADMIN, utilisateur_reponse, utilisateurs_reponses
from staport.domains.auth.models import Permission, Role, Utilisateur
from staport.domains.auth.parametres import ParametresSecurite
from staport.domains.auth.schemas import (
    RefusPermissionsRequete,
    ReinitialisationAdminRequete,
    UtilisateurCreationRequete,
    UtilisateurModificationRequete,
    UtilisateurRecherche,
    UtilisateurReponse,
)
from staport.domains.auth.securite import Hacheur
from staport.domains.auth.service_auth import ServiceAuth, exiger_mot_de_passe_conforme
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import incrementer_version, verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page
from staport.domains.common.securite import ActionSecurite, EvenementSecurite


async def resoudre_roles(session: AsyncSession, identifiants: set[int]) -> set[Role]:
    if not identifiants:
        return set()
    trouves = await repository.roles_par_ids(session, identifiants)
    if len(trouves) != len(identifiants):
        raise RoleIntrouvable(next(iter(identifiants)))
    return set(trouves)


async def resoudre_permissions(session: AsyncSession, identifiants: set[int]) -> set[Permission]:
    if not identifiants:
        return set()
    trouvees = await repository.permissions_par_ids(session, identifiants)
    if len(trouvees) != len(identifiants):
        connus = {p.id for p in trouvees}
        raise PermissionInconnue({str(i) for i in identifiants if i not in connus})
    return set(trouvees)


class ServiceUtilisateur:
    def __init__(
        self,
        hacheur: Hacheur,
        parametres: ParametresSecurite,
        evenements: Auditeur,
        service_auth: ServiceAuth,
    ) -> None:
        self._hacheur = hacheur
        self._parametres = parametres
        self._evenements = evenements
        self._auth = service_auth

    async def rechercher(
        self, session: AsyncSession, criteres: UtilisateurRecherche | None, pagination: Pagination
    ) -> Page[UtilisateurReponse]:
        c = criteres or UtilisateurRecherche()
        async with session.begin():
            lignes, total = await repository.rechercher_utilisateurs(session, c.username, c.email, c.actif, pagination)
            contenu = await utilisateurs_reponses(session, lignes)
        return creer_page(contenu, pagination.taille, pagination.page, total)

    async def lire(self, session: AsyncSession, identifiant: int) -> UtilisateurReponse:
        async with session.begin():
            return await utilisateur_reponse(session, await self._obtenir(session, identifiant))

    async def creer(self, session: AsyncSession, requete: UtilisateurCreationRequete) -> UtilisateurReponse:
        action = self._evenements.auditer(session, "UTILISATEUR_CREATION", TypeOperation.CREATE, "Utilisateur")
        async with session.begin(), action as cible:
            longueur = await self._parametres.longueur_minimale_mot_de_passe(session)
            exiger_mot_de_passe_conforme(requete.mot_de_passe, requete.username, longueur)
            if await repository.username_existe(session, requete.username):
                raise NomUtilisateurDejaPris(requete.username)
            if await repository.email_existe(session, requete.email):
                raise EmailDejaPris(requete.email)
            await self._verifier_employe(session, requete.employee_id)
            roles = await resoudre_roles(session, requete.role_ids)
            utilisateur = Utilisateur(
                username=requete.username,
                email=requete.email,
                mot_de_passe_hash=await self._hacheur.hacher(requete.mot_de_passe),
                actif=True,
                employee_id=requete.employee_id,
            )
            utilisateur.roles = roles
            utilisateur.permissions_refusees = set()
            session.add(utilisateur)
            await session.flush()
            cible.identifiant = utilisateur.id
            return await utilisateur_reponse(session, utilisateur)

    async def modifier(
        self, session: AsyncSession, identifiant: int, requete: UtilisateurModificationRequete
    ) -> UtilisateurReponse:
        action = self._evenements.auditer(
            session, "UTILISATEUR_MODIFICATION", TypeOperation.UPDATE, "Utilisateur", identifiant
        )
        async with session.begin(), action:
            utilisateur = await self._obtenir(session, identifiant)
            verifier_version(requete.version, utilisateur.version)
            autre = await repository.utilisateur_par_email(session, requete.email)
            if autre is not None and autre.id != identifiant:
                raise EmailDejaPris(requete.email)
            desactive = utilisateur.actif and not requete.actif
            await self._verifier_employe(session, requete.employee_id)
            roles = await resoudre_roles(session, requete.role_ids)
            utilisateur.email = requete.email
            utilisateur.actif = requete.actif
            utilisateur.employee_id = requete.employee_id
            utilisateur.roles = roles
            incrementer_version(utilisateur)
            await session.flush()
            if desactive:
                await self._auth.revoquer_sessions_sans_transaction(session, identifiant)
            return await utilisateur_reponse(session, utilisateur)

    async def definir_permissions_refusees(
        self, session: AsyncSession, identifiant: int, requete: RefusPermissionsRequete
    ) -> UtilisateurReponse:
        action = self._evenements.auditer(
            session, "UTILISATEUR_PERMISSIONS_REFUSEES", TypeOperation.UPDATE, "Utilisateur", identifiant
        )
        async with session.begin(), action:
            utilisateur = await self._obtenir(session, identifiant)
            verifier_version(requete.version, utilisateur.version)
            refusees = await resoudre_permissions(session, requete.permission_ids)
            utilisateur.permissions_refusees = refusees
            incrementer_version(utilisateur)
            await session.flush()
            return await utilisateur_reponse(session, utilisateur)

    async def reinitialiser_mot_de_passe_par_admin(
        self, session: AsyncSession, identifiant: int, requete: ReinitialisationAdminRequete
    ) -> None:
        async with session.begin():
            utilisateur = await self._obtenir(session, identifiant)
            longueur = await self._parametres.longueur_minimale_mot_de_passe(session)
            exiger_mot_de_passe_conforme(requete.nouveau_mot_de_passe, utilisateur.username, longueur)
            utilisateur.mot_de_passe_hash = await self._hacheur.hacher(requete.nouveau_mot_de_passe)
            # Comme la réinitialisation par lien : l'ancien mot de passe est peut-être celui que l'on cherche à écarter.
            sessions = await self._auth.revoquer_sessions_sans_transaction(session, identifiant)
            # L'acteur est l'administrateur authentifié (contexte) ; le compte visé est dans le détail.
            await self._evenements.publier(
                EvenementSecurite(
                    ActionSecurite.MOT_DE_PASSE_REINITIALISE_PAR_ADMIN,
                    details={
                        "cibleId": identifiant,
                        "cibleUsername": utilisateur.username,
                        "sessionsRevoquees": sessions,
                    },
                )
            )

    async def admin_existe(self, session: AsyncSession) -> bool:
        async with session.begin():
            return await repository.admin_existe(session, SYSTEM_ADMIN)

    async def creer_admin_initial(self, session: AsyncSession, username: str, email: str, mot_de_passe: str) -> int:
        action = self._evenements.auditer(session, "UTILISATEUR_CREATION", TypeOperation.CREATE, "Utilisateur")
        async with session.begin(), action as cible:
            role = next((r for r in await repository.tous_les_roles(session) if r.nom == SYSTEM_ADMIN), None)
            if role is None:
                raise RoleIntrouvable(-1)
            admin = Utilisateur(
                username=username.strip(),
                email=email.strip(),
                mot_de_passe_hash=await self._hacheur.hacher(mot_de_passe),
                actif=True,
            )
            admin.roles = {role}
            admin.permissions_refusees = set()
            session.add(admin)
            await session.flush()
            cible.identifiant = admin.id
            return admin.id

    async def _verifier_employe(self, session: AsyncSession, employee_id: int | None) -> None:
        if employee_id is not None and not await repository.employe_existe(session, employee_id):
            raise ReferenceInvalide(f"Employé introuvable avec l'id : {employee_id}")

    async def charger(self, session: AsyncSession, identifiant: int) -> Utilisateur:
        """L'utilisateur avec ses rôles et permissions chargés (à lire dans une transaction ouverte par l'appelant)."""
        return await self._obtenir(session, identifiant)

    async def _obtenir(self, session: AsyncSession, identifiant: int) -> Utilisateur:
        utilisateur = await repository.utilisateur_par_id(session, identifiant)
        if utilisateur is None:
            raise UtilisateurIntrouvable(identifiant)
        return utilisateur
