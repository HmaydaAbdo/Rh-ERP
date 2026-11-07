from io import BytesIO

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.common.pagination import Pagination
from staport.domains.common.schemas import Page, creer_page

from . import import_fichier, repository
from .exceptions import EquipeDejaExistante, EquipeIntrouvable, EquipeUtilisee
from .models import Equipe
from .schemas import (
    EquipeCreationRequete,
    EquipeImportReponse,
    EquipeModificationRequete,
    EquipeRecherche,
    EquipeReponse,
)


def _reponse(equipe: Equipe) -> EquipeReponse:
    return EquipeReponse.model_validate(equipe)


class ServiceEquipe:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    async def rechercher(
        self, session: AsyncSession, criteres: EquipeRecherche | None, page: Pagination
    ) -> Page[EquipeReponse]:
        async with session.begin():
            lignes, total = await repository.rechercher(session, criteres or EquipeRecherche(), page)
            contenu = [_reponse(ligne) for ligne in lignes]
        return creer_page(contenu, page.taille, page.page, total)

    async def lire(self, session: AsyncSession, identifiant: int) -> EquipeReponse:
        async with session.begin():
            return _reponse(await self._obtenir(session, identifiant))

    async def creer(self, session: AsyncSession, requete: EquipeCreationRequete) -> EquipeReponse:
        action = self._auditeur.auditer(session, "EQUIPE_CREATION", TypeOperation.CREATE, "Equipe")
        async with session.begin(), action as cible:
            code, libelle = requete.code.strip().upper(), requete.libelle.strip()
            await self._unicite(session, code, libelle)
            ligne = Equipe(code=code, libelle=libelle)
            session.add(ligne)
            await session.flush()
            cible.identifiant = ligne.id
            return _reponse(ligne)

    async def modifier(
        self, session: AsyncSession, identifiant: int, requete: EquipeModificationRequete
    ) -> EquipeReponse:
        action = self._auditeur.auditer(session, "EQUIPE_MODIFICATION", TypeOperation.UPDATE, "Equipe", identifiant)
        async with session.begin(), action:
            ligne = await self._obtenir(session, identifiant)
            verifier_version(requete.version, ligne.version)
            code, libelle = requete.code.strip().upper(), requete.libelle.strip()
            await self._unicite(session, code, libelle, identifiant)
            ligne.code, ligne.libelle = code, libelle
            await session.flush()
            return _reponse(ligne)

    async def supprimer(self, session: AsyncSession, identifiant: int) -> None:
        action = self._auditeur.auditer(session, "EQUIPE_SUPPRESSION", TypeOperation.DELETE, "Equipe", identifiant)
        async with session.begin(), action:
            ligne = await self._obtenir(session, identifiant)
            await session.delete(ligne)
            try:
                await session.flush()
            except IntegrityError as erreur:
                raise EquipeUtilisee from erreur

    @staticmethod
    async def _obtenir(session: AsyncSession, identifiant: int) -> Equipe:
        ligne = await repository.par_id(session, identifiant)
        if ligne is None:
            raise EquipeIntrouvable(identifiant)
        return ligne

    @staticmethod
    async def _unicite(session: AsyncSession, code: str, libelle: str, sauf_id: int | None = None) -> None:
        code_existe, libelle_existe = await repository.existe(session, code, libelle, sauf_id)
        if code_existe:
            raise EquipeDejaExistante("code", code)
        if libelle_existe:
            raise EquipeDejaExistante("libellé", libelle)

    async def importer(self, session: AsyncSession, nom_fichier: str | None, contenu: bytes) -> EquipeImportReponse:
        return await import_fichier.importer(self._auditeur, session, nom_fichier, contenu)

    @staticmethod
    def modele_import() -> BytesIO:
        return import_fichier.generer_modele()
