"""Synchronisation planifiée des chantiers (parité avec `ChantierSyncScheduler`).

La planification est le paramètre « Planification de la synchronisation des chantiers » (jamais la configuration
d'environnement, `conventions/configuration.md`). Elle est relue à chaque calcul de la prochaine exécution : un
changement s'applique donc après l'exécution en attente, sans redémarrage. Les chantiers créés sont attribués à
« Système », d'origine `TACHE_PLANIFIEE`, sous un identifiant d'exécution unique (`conventions/audit.md`). Une
expression à six champs est lue en UTC.
"""

import asyncio
import contextlib
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import cast

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from staport.domains.common.audit_contexte import Origine, contexte_batch
from staport.domains.parametre.catalogue import declencheur_cron
from staport.domains.parametre.service import ServiceParametre

from .service import ServiceChantier

journal = logging.getLogger(__name__)

ATTENTE_APRES_ERREUR_SECONDES = 300.0
"""Si le paramètre est illisible (installation incomplète, base indisponible), nouvelle tentative plus tard."""


class PlanificationSynchronisation:
    def __init__(
        self,
        fabrique: async_sessionmaker[AsyncSession],
        parametres: ServiceParametre,
        chantiers: ServiceChantier,
        url_erp: str,
        maintenant: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._fabrique = fabrique
        self._parametres = parametres
        self._chantiers = chantiers
        self._url_erp = url_erp
        self._maintenant = maintenant
        self._tache: asyncio.Task[None] | None = None

    def demarrer(self) -> None:
        self._tache = asyncio.create_task(self._boucle())

    async def arreter(self) -> None:
        if self._tache is not None:
            self._tache.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._tache

    async def secondes_avant_prochaine_execution(self) -> float:
        async with self._fabrique() as session, session.begin():
            expression = await self._parametres.cron_synchronisation_chantiers(session)
        maintenant = self._maintenant()
        declencheur = declencheur_cron(expression)
        prochaine = cast("datetime | None", declencheur.get_next_fire_time(None, maintenant))  # pyright: ignore
        if prochaine is None:
            raise ValueError(f"l'expression « {expression} » n'a plus d'exécution à venir")
        return max(0.0, (prochaine - maintenant).total_seconds())

    async def executer(self) -> None:
        """Une exécution : toute erreur est journalisée et mesurée par le service, jamais propagée à la boucle."""
        with contextlib.suppress(Exception), contexte_batch("Système", Origine.TACHE_PLANIFIEE):
            async with self._fabrique() as session:
                await self._chantiers.synchroniser(session, self._url_erp)

    async def _boucle(self) -> None:
        while True:
            try:
                attente = await self.secondes_avant_prochaine_execution()
            except Exception:
                journal.exception("Planification de la synchronisation des chantiers illisible")
                await asyncio.sleep(ATTENTE_APRES_ERREUR_SECONDES)
                continue
            await asyncio.sleep(attente)
            await self.executer()
            await asyncio.sleep(1)  # un réveil légèrement en avance ne doit pas rejouer la même échéance
