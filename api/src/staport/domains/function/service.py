from io import BytesIO

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page

from . import import_fichier, repository
from .exceptions import FonctionDejaExistante, FonctionIntrouvable, FonctionUtilisee
from .models import Fonction
from .schemas import (
    FonctionCreationRequete,
    FonctionImportReponse,
    FonctionModificationRequete,
    FonctionRecherche,
    FonctionReponse,
)


def _reponse(fonction: Fonction) -> FonctionReponse:
    return FonctionReponse.model_validate(fonction)


class ServiceFonction:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    async def rechercher(
        self, session: AsyncSession, criteres: FonctionRecherche | None, page: Pagination
    ) -> Page[FonctionReponse]:
        async with session.begin():
            lignes, total = await repository.rechercher(session, (criteres or FonctionRecherche()).libelle, page)
            contenu = [_reponse(ligne) for ligne in lignes]
        return creer_page(contenu, page.taille, page.page, total)

    async def lire(self, session: AsyncSession, identifiant: int) -> FonctionReponse:
        async with session.begin():
            ligne = await self._obtenir(session, identifiant)
            return _reponse(ligne)

    async def creer(self, session: AsyncSession, requete: FonctionCreationRequete) -> FonctionReponse:
        action = self._auditeur.auditer(session, "FONCTION_CREATION", TypeOperation.CREATE, "Function")
        async with session.begin(), action as cible:
            libelle = requete.libelle.strip()
            if await repository.existe_par_libelle(session, libelle):
                raise FonctionDejaExistante(libelle)
            ligne = Fonction(libelle=libelle)
            session.add(ligne)
            await session.flush()
            cible.identifiant = ligne.id
            return _reponse(ligne)

    async def modifier(
        self, session: AsyncSession, identifiant: int, requete: FonctionModificationRequete
    ) -> FonctionReponse:
        action = self._auditeur.auditer(session, "FONCTION_MODIFICATION", TypeOperation.UPDATE, "Function", identifiant)
        async with session.begin(), action:
            ligne = await self._obtenir(session, identifiant)
            verifier_version(requete.version, ligne.version)
            libelle = requete.libelle.strip()
            if await repository.existe_par_libelle(session, libelle, identifiant):
                raise FonctionDejaExistante(libelle)
            ligne.libelle = libelle
            await session.flush()
            return _reponse(ligne)

    async def supprimer(self, session: AsyncSession, identifiant: int) -> None:
        action = self._auditeur.auditer(session, "FONCTION_SUPPRESSION", TypeOperation.DELETE, "Function", identifiant)
        async with session.begin(), action:
            ligne = await self._obtenir(session, identifiant)
            await session.delete(ligne)
            try:
                await session.flush()
            except IntegrityError as erreur:
                raise FonctionUtilisee from erreur

    @staticmethod
    async def _obtenir(session: AsyncSession, identifiant: int) -> Fonction:
        ligne = await repository.par_id(session, identifiant)
        if ligne is None:
            raise FonctionIntrouvable(identifiant)
        return ligne

    async def importer(self, session: AsyncSession, nom_fichier: str | None, contenu: bytes) -> FonctionImportReponse:
        return await import_fichier.importer(self._auditeur, session, nom_fichier, contenu)

    @staticmethod
    def modele_import() -> BytesIO:
        return import_fichier.generer_modele()
