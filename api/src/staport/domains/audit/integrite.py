"""Intégrité du journal (parité avec `VerificationIntegriteAudit`).

Au démarrage puis périodiquement :
1. le compte applicatif ne doit pas pouvoir modifier une table d'audit (un audit réécrivable n'est pas opposable) ;
2. la chaîne de hachage locale du journal (V19) doit être valide.

Le non-respect du premier point n'empêche pas le démarrage (en développement et en CI un seul compte sert à tout) :
un avertissement et la jauge `integrite_compromise` le signalent. La vérification de la chaîne prend un verrou
consultatif : avec plusieurs instances, une seule vérifie à la fois.
"""

import asyncio
import contextlib
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from staport.domains.audit.metriques import MetriquesAudit

journal = logging.getLogger("staport.audit")

VERROU_VERIFICATION = {"a": 731942, "b": 2}

TABLES_MODIFIABLES = text(
    """
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relkind = 'r'
      AND (c.relname LIKE 'audit\\_%' OR c.relname LIKE '%\\_aud')
      AND (has_table_privilege(current_user, c.oid, 'UPDATE')
           OR has_table_privilege(current_user, c.oid, 'DELETE')
           OR has_table_privilege(current_user, c.oid, 'TRUNCATE'))
    ORDER BY c.relname"""
)


class VerificationIntegrite:
    def __init__(self, fabrique: async_sessionmaker[AsyncSession], metriques: MetriquesAudit, delai_ms: int) -> None:
        self._fabrique = fabrique
        self._metriques = metriques
        self._delai = delai_ms / 1000
        self._tache: asyncio.Task[None] | None = None

    async def verifier_comptes(self) -> list[str]:
        async with self._fabrique() as session, session.begin():
            modifiables = list((await session.execute(TABLES_MODIFIABLES)).scalars())
        self._metriques.integrite_compromise = 1 if modifiables else 0
        if modifiables:
            journal.warning(
                "Intégrité de l'audit NON garantie : le compte applicatif peut modifier %d table(s) d'audit %s. "
                "Normal en développement avec un seul compte PostgreSQL ; en production, utiliser deux comptes "
                "(DB_MIGRATION_USER pour les migrations, DB_USER pour l'application).",
                len(modifiables),
                modifiables,
            )
        else:
            journal.info("Intégrité de l'audit : le compte applicatif ne peut pas modifier les tables d'audit")
        return modifiables

    async def verifier_chaine(self) -> bool | None:
        """`None` si une autre instance tient le verrou (elle vérifie à notre place)."""
        async with self._fabrique() as session:
            connexion = await session.connection()
            verrou = (
                await connexion.execute(text("SELECT pg_try_advisory_lock(:a, :b)"), VERROU_VERIFICATION)
            ).scalar_one()
            if not verrou:
                return None
            try:
                valide = bool((await connexion.execute(text("SELECT audit_journal_chaine_valide()"))).scalar_one())
            finally:
                await connexion.execute(text("SELECT pg_advisory_unlock(:a, :b)"), VERROU_VERIFICATION)
            await session.rollback()
        self._metriques.chaine_invalide = 0 if valide else 1
        if not valide:
            journal.error("Intégrité de la chaîne locale du journal d'audit compromise")
        return valide

    async def demarrer(self) -> None:
        await self.verifier_comptes()
        await self.verifier_chaine()
        self._tache = asyncio.create_task(self._boucle())

    async def _boucle(self) -> None:
        while True:
            await asyncio.sleep(self._delai)
            try:
                await self.verifier_chaine()
            except Exception:
                journal.exception("Vérification de la chaîne d'audit impossible")

    async def arreter(self) -> None:
        if self._tache is not None:
            self._tache.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._tache
