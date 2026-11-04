"""Paramètres administrables (parité avec `ParametreService` de Spring) et lecteurs typés des autres domaines.

Contrairement à Spring, aucune valeur n'est gardée en mémoire : chaque lecture interroge la base. L'application peut
tourner en plusieurs processus, et une modification faite par un administrateur doit s'appliquer partout aussitôt, sans
invalidation distante. Le coût est une lecture indexée sur `cle` par appel.
"""

from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.domains.parametre import catalogue
from staport.domains.parametre.catalogue import DefinitionParametre
from staport.domains.parametre.exceptions import InstallationIncomplete, ParametreIntrouvable
from staport.domains.parametre.models import Parametre
from staport.domains.parametre.schemas import ParametreModificationRequete, ParametreReponse


def _reponse(ligne: Parametre, definition: DefinitionParametre) -> ParametreReponse:
    return ParametreReponse(
        id=ligne.id,
        version=ligne.version,
        cle=ligne.cle,
        libelle=definition.libelle,
        description=definition.description,
        type=definition.type,
        unite=definition.unite,
        minimum=definition.minimum,
        maximum=definition.maximum,
        valeur=ligne.valeur,
    )


class ServiceParametre:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    async def lister(self, session: AsyncSession) -> list[ParametreReponse]:
        """Le catalogue est fixe (quelques paramètres, jamais de saisie libre) : la liste n'est pas paginée."""
        async with session.begin():
            par_cle = {p.cle: p for p in (await session.scalars(select(Parametre))).all()}
        reponses: list[ParametreReponse] = []
        for definition in catalogue.CATALOGUE:
            ligne = par_cle.get(definition.code)
            if ligne is None:
                raise InstallationIncomplete(definition.code)
            reponses.append(_reponse(ligne, definition))
        return reponses

    async def modifier(
        self, session: AsyncSession, identifiant: int, requete: ParametreModificationRequete
    ) -> ParametreReponse:
        action = self._auditeur.auditer(
            session, "PARAMETRE_MODIFICATION", TypeOperation.UPDATE, "Parametre", identifiant
        )
        async with session.begin(), action:
            ligne = await session.get(Parametre, identifiant)
            if ligne is None:
                raise ParametreIntrouvable(identifiant)
            verifier_version(requete.version, ligne.version)
            definition = catalogue.depuis_code(ligne.cle)
            if definition is None:
                raise InstallationIncomplete(ligne.cle)
            ligne.valeur = definition.normaliser(requete.valeur)
            await session.flush()
            return _reponse(ligne, definition)

    # --- Lecteurs typés (port `ParametresSecurite` du domaine auth, et lecteurs des autres domaines) ---

    async def duree_jeton_acces(self, session: AsyncSession) -> timedelta:
        return timedelta(minutes=await self._entier(session, catalogue.JETON_ACCES))

    async def duree_jeton_session(self, session: AsyncSession) -> timedelta:
        return timedelta(hours=await self._entier(session, catalogue.JETON_SESSION))

    async def duree_lien_reinitialisation(self, session: AsyncSession) -> timedelta:
        return timedelta(minutes=await self._entier(session, catalogue.LIEN_REINITIALISATION))

    async def longueur_minimale_mot_de_passe(self, session: AsyncSession) -> int:
        return await self._entier(session, catalogue.LONGUEUR_MOT_DE_PASSE)

    async def pas_tranche_analytique(self, session: AsyncSession) -> Decimal:
        return Decimal(await self._entier(session, catalogue.PAS_TRANCHE_ANALYTIQUE))

    async def cron_synchronisation_chantiers(self, session: AsyncSession) -> str:
        return await self._valeur(session, catalogue.CRON_SYNCHRONISATION_CHANTIERS)

    async def _entier(self, session: AsyncSession, definition: DefinitionParametre) -> int:
        return int(await self._valeur(session, definition))

    @staticmethod
    async def _valeur(session: AsyncSession, definition: DefinitionParametre) -> str:
        """Une clé du catalogue sans ligne en base est une installation incomplète : on refuse de continuer."""
        valeur = (await session.execute(select(Parametre.valeur).where(Parametre.cle == definition.code))).scalar()
        if valeur is None:
            raise InstallationIncomplete(definition.code)
        return valeur
