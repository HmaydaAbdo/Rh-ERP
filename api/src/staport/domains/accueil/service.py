"""Accueil personnalisé (parité de `AccueilService`) : le choix et l'ordre des indicateurs de chaque utilisateur."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth import repository as repository_auth
from staport.domains.auth.exceptions import UtilisateurIntrouvable
from staport.domains.auth.mappage import permissions_effectives
from staport.domains.auth.models import Utilisateur
from staport.domains.common.audit_contexte import Auditeur, TypeOperation
from staport.domains.common.optimiste import verifier_version
from staport.platform.erreurs import ConflitModification

from .catalogue import CATALOGUE
from .exceptions import AccueilInvalide
from .models import PreferenceAccueil
from .schemas import AccueilModificationRequete, AccueilReponse, IndicateurDisponible

SEPARATEUR = ","
ENTITE = "PreferenceAccueil"


def _codes_autorises(utilisateur: Utilisateur) -> set[str]:
    permissions = permissions_effectives(utilisateur)
    return {indicateur.code for indicateur in CATALOGUE if indicateur.permission in permissions}


def _reponse(utilisateur: Utilisateur, preference: PreferenceAccueil | None) -> AccueilReponse:
    """Sans choix : tous les indicateurs autorisés, dans l'ordre du catalogue ; sinon le choix, amputé de ce qui n'est
    plus autorisé. Un choix vidé par la perte de droits (et non vidé volontairement) retombe sur tous."""
    autorises = _codes_autorises(utilisateur)
    tous = [indicateur.code for indicateur in CATALOGUE if indicateur.code in autorises]
    if preference is None:
        indicateurs = tous
    else:
        choisis = [code for code in preference.indicateurs.split(SEPARATEUR) if code in autorises]
        indicateurs = tous if not choisis and preference.indicateurs != "" else choisis
    disponibles = [
        IndicateurDisponible(code=i.code, libelle=i.libelle, description=i.description)
        for i in CATALOGUE
        if i.code in autorises
    ]
    return AccueilReponse(
        version=None if preference is None else preference.version,
        personnalise=preference is not None,
        indicateurs=indicateurs,
        disponibles=disponibles,
    )


class ServiceAccueil:
    def __init__(self, auditeur: Auditeur) -> None:
        self._auditeur = auditeur

    async def lire(self, session: AsyncSession, utilisateur_id: int) -> AccueilReponse:
        async with session.begin():
            utilisateur = await self._utilisateur(session, utilisateur_id)
            return _reponse(utilisateur, await self._preference(session, utilisateur_id))

    async def enregistrer(
        self, session: AsyncSession, utilisateur_id: int, requete: AccueilModificationRequete
    ) -> AccueilReponse:
        action = self._auditeur.auditer(session, "ACCUEIL_MODIFICATION", TypeOperation.UPDATE, ENTITE)
        async with session.begin(), action as cible:
            utilisateur = await self._utilisateur(session, utilisateur_id)
            autorises = _codes_autorises(utilisateur)
            catalogue = {indicateur.code for indicateur in CATALOGUE}
            vus: set[str] = set()
            for code in requete.indicateurs:
                if code not in catalogue:
                    raise AccueilInvalide(f"Indicateur inconnu : {code}")
                if code not in autorises:
                    raise AccueilInvalide(f"Indicateur non autorisé pour cet utilisateur : {code}")
                if code in vus:
                    raise AccueilInvalide(f"Indicateur en double : {code}")
                vus.add(code)
            preference = await self._preference(session, utilisateur_id)
            verifier_version(requete.version, None if preference is None else preference.version)
            if preference is None:
                preference = PreferenceAccueil(utilisateur_id=utilisateur_id, indicateurs="")
                session.add(preference)
            preference.indicateurs = SEPARATEUR.join(requete.indicateurs)
            try:
                await session.flush()
            except IntegrityError as erreur:
                # Deux premiers enregistrements simultanés : le second perd, comme une version périmée.
                raise ConflitModification from erreur
            cible.identifiant = preference.id
            return _reponse(utilisateur, preference)

    async def reinitialiser(self, session: AsyncSession, utilisateur_id: int) -> AccueilReponse:
        action = self._auditeur.auditer(session, "ACCUEIL_REINITIALISATION", TypeOperation.DELETE, ENTITE)
        async with session.begin(), action as cible:
            utilisateur = await self._utilisateur(session, utilisateur_id)
            preference = await self._preference(session, utilisateur_id)
            if preference is not None:
                cible.identifiant = preference.id
                await session.delete(preference)
                await session.flush()
            return _reponse(utilisateur, None)

    @staticmethod
    async def _utilisateur(session: AsyncSession, utilisateur_id: int) -> Utilisateur:
        utilisateur = await repository_auth.utilisateur_par_id(session, utilisateur_id)
        if utilisateur is None:
            raise UtilisateurIntrouvable(utilisateur_id)
        return utilisateur

    @staticmethod
    async def _preference(session: AsyncSession, utilisateur_id: int) -> PreferenceAccueil | None:
        requete = select(PreferenceAccueil).where(PreferenceAccueil.utilisateur_id == utilisateur_id)
        return (await session.execute(requete)).scalar_one_or_none()
