"""Paramètres de sécurité lus par le domaine auth.

Le port `ParametresSecurite` isole auth du domaine `parametre` (KAN-215), qui en fournira l'implémentation. D'ici là,
`ParametresSecuriteSql` lit directement la table `parametre` (clés et valeurs de repli identiques au catalogue
`CleParametre` de Spring), à chaque appel : une modification par un administrateur s'applique tout de suite.
"""

from datetime import timedelta
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CLE_JETON_ACCES = "securite.jeton-acces.minutes"
CLE_JETON_SESSION = "securite.jeton-session.heures"
CLE_LIEN_REINITIALISATION = "securite.lien-reinitialisation.minutes"
CLE_LONGUEUR_MOT_DE_PASSE = "securite.mot-de-passe.longueur-minimale"

VALEURS_DE_REPLI = {
    CLE_JETON_ACCES: 15,
    CLE_JETON_SESSION: 12,
    CLE_LIEN_REINITIALISATION: 60,
    CLE_LONGUEUR_MOT_DE_PASSE: 10,
}


class ParametresSecurite(Protocol):
    async def duree_jeton_acces(self, session: AsyncSession) -> timedelta: ...
    async def duree_jeton_session(self, session: AsyncSession) -> timedelta: ...
    async def duree_lien_reinitialisation(self, session: AsyncSession) -> timedelta: ...
    async def longueur_minimale_mot_de_passe(self, session: AsyncSession) -> int: ...


class ParametresSecuriteSql:
    async def _entier(self, session: AsyncSession, cle: str) -> int:
        valeur = (await session.execute(text("SELECT valeur FROM parametre WHERE cle = :cle"), {"cle": cle})).scalar()
        try:
            return int(valeur) if valeur is not None else VALEURS_DE_REPLI[cle]
        except ValueError:
            return VALEURS_DE_REPLI[cle]

    async def duree_jeton_acces(self, session: AsyncSession) -> timedelta:
        return timedelta(minutes=await self._entier(session, CLE_JETON_ACCES))

    async def duree_jeton_session(self, session: AsyncSession) -> timedelta:
        return timedelta(hours=await self._entier(session, CLE_JETON_SESSION))

    async def duree_lien_reinitialisation(self, session: AsyncSession) -> timedelta:
        return timedelta(minutes=await self._entier(session, CLE_LIEN_REINITIALISATION))

    async def longueur_minimale_mot_de_passe(self, session: AsyncSession) -> int:
        return await self._entier(session, CLE_LONGUEUR_MOT_DE_PASSE)
