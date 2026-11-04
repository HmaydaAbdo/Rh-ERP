"""Port des paramètres de sécurité lus par le domaine auth.

Le domaine `parametre` (KAN-215) en fournit l'implémentation (`ServiceParametre`) : auth ne connaît que ce port. Chaque
lecture interroge la base, donc une modification par un administrateur s'applique tout de suite.
"""

from datetime import timedelta
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession


class ParametresSecurite(Protocol):
    async def duree_jeton_acces(self, session: AsyncSession) -> timedelta: ...
    async def duree_jeton_session(self, session: AsyncSession) -> timedelta: ...
    async def duree_lien_reinitialisation(self, session: AsyncSession) -> timedelta: ...
    async def longueur_minimale_mot_de_passe(self, session: AsyncSession) -> int: ...
