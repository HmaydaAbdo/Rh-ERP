# LangGraph et ses intégrations ne publient pas de stubs complets : seules ces deux règles sont levées, et seulement
# pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Conversations durables de l'assistant (site/docs/ia, T19).

Le checkpointer officiel de LangGraph pour PostgreSQL (``AsyncPostgresSaver``) garde l'état de chaque conversation
dans une base dédiée à l'IA (base ``ia`` du PostgreSQL de l'ERP, compte limité à cette base) : une question posée
après un redémarrage, ou le lendemain, retrouve son fil. Le ``Store`` officiel (``AsyncPostgresStore``) garde dans la
même base
les fichiers de l'espace de chaque utilisateur (``/espace/``), avec l'expiration native (``TTLConfig``) : ils survivent
à un redémarrage et sont partagés entre instances. La base est obligatoire, en local comme en production : aucun
repli sur la mémoire du processus dans le service (il masquerait une panne de configuration, KAN-39) ; seuls les tests
rapides y recourent, par injection (``tests/doubles.py``).

Deux règles à nous, parce qu'aucun framework ne les fournit :
- l'identifiant de conversation envoyé par le navigateur n'est jamais pris tel quel : il est préfixé par l'identité de
  l'utilisateur (``espace_conversation``), pour qu'un utilisateur ne puisse ni lire ni prolonger celle d'un autre ;
- une conversation inactive depuis plus de ``IA_CONVERSATION_JOURS`` jours est supprimée (``purger``).
"""

import asyncio
import base64
import hashlib
import json
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, NamedTuple

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.base import BaseStore, TTLConfig
from langgraph.store.postgres.aio import AsyncPostgresStore
from psycopg import AsyncConnection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import AsyncConnectionPool

journal = logging.getLogger(__name__)

#: Une conversation sans nouvel échange depuis ce nombre de jours est supprimée.
JOURS_PAR_DEFAUT = 30
PERIODE_PURGE_SECONDES = 24 * 3600


class Memoire(NamedTuple):
    """Ce que le service garde entre deux requêtes : les conversations et les fichiers des utilisateurs."""

    checkpointer: BaseCheckpointSaver[Any]
    store: BaseStore


def sujet(jeton_agent: str) -> str:
    """L'identité portée par le jeton agent (champ ``sub``), émis à l'instant par l'API pour l'utilisateur connecté.

    Un jeton illisible (doubles de test) donne une empreinte : l'espace reste propre à ce jeton, jamais partagé.
    """
    try:
        charge = jeton_agent.split(".")[1]
        sub = json.loads(base64.urlsafe_b64decode(charge + "=" * (-len(charge) % 4))).get("sub")
        if isinstance(sub, str) and sub:
            return sub
    except IndexError, ValueError:
        pass
    return "anonyme-" + hashlib.sha256(jeton_agent.encode()).hexdigest()[:16]


def proprietaire(jeton_agent: str) -> str:
    """L'étiquette de l'espace de l'utilisateur dans le Store (fichiers, mémoire longue) : son identifiant interne.

    Le Store de LangGraph refuse le point dans une étiquette d'espace de noms (``InvalidNamespaceError``, KAN-303) : le
    nom d'utilisateur ne convient donc pas (``prenom.nom``), et il peut être renommé. L'identifiant interne (champ
    ``uid`` du jeton agent) est stable et valide. Sans ``uid`` (jeton de test), l'étiquette retombe sur ``sujet``.
    """
    try:
        charge = jeton_agent.split(".")[1]
        uid = json.loads(base64.urlsafe_b64decode(charge + "=" * (-len(charge) % 4))).get("uid")
        if isinstance(uid, int) and not isinstance(uid, bool):
            return f"u{uid}"
    except IndexError, ValueError:
        pass
    return sujet(jeton_agent)


#: Utilisateurs dont l'espace d'avant KAN-303 (rangé sous le nom d'utilisateur) a déjà été rapatrié par ce processus.
_RAPATRIES: set[str] = set()
_ESPACES = ("espace", "memoire")


async def rapatrier(store: BaseStore, jeton_agent: str) -> None:
    """Déplace une fois, sous l'identifiant interne, ce que l'utilisateur avait rangé sous son nom d'utilisateur.

    Avant KAN-303 le Store rangeait les fichiers et la mémoire longue sous ``(nom d'utilisateur, espace)`` ; sans ce
    déplacement ils disparaîtraient pour l'utilisateur. Idempotent : une ligne déplacée n'existe plus sous l'ancien
    nom. En cas de conflit (la clé existe déjà sous le nouvel espace), rien n'est écrasé ni supprimé : l'ancienne ligne
    reste sous l'ancien nom. Un nom avec un point n'a jamais eu d'espace.
    """
    ancien, nouveau = sujet(jeton_agent), proprietaire(jeton_agent)
    if ancien == nouveau or "." in ancien or nouveau in _RAPATRIES:
        return
    for espace in _ESPACES:
        for element in await store.asearch((ancien, espace), limit=1000):
            if await store.aget((nouveau, espace), element.key) is not None:
                continue  # conflit : ni écrasement, ni suppression ; l'ancienne ligne reste sous l'ancien nom
            await store.aput((nouveau, espace), element.key, element.value)
            await store.adelete((ancien, espace), element.key)
    _RAPATRIES.add(nouveau)


def espace_conversation(utilisateur: str, thread_id: str) -> str:
    """Le fil de cet utilisateur : la même conversation chez deux utilisateurs donne deux fils distincts."""
    return f"{utilisateur}:{thread_id}"


async def purger(pool: AsyncConnectionPool[AsyncConnection[DictRow]], memoire: AsyncPostgresSaver, jours: int) -> int:
    """Supprime les conversations sans échange depuis plus de ``jours`` jours ; rend leur nombre."""
    async with pool.connection() as connexion, connexion.cursor() as curseur:
        await curseur.execute(
            "SELECT thread_id FROM checkpoints GROUP BY thread_id "
            "HAVING max((checkpoint ->> 'ts')::timestamptz) < now() - make_interval(days => %s)",
            (jours,),
        )
        anciennes = [str(ligne["thread_id"]) for ligne in await curseur.fetchall()]
    for thread_id in anciennes:
        await memoire.adelete_thread(thread_id)
    return len(anciennes)


async def _purge_reguliere(
    pool: AsyncConnectionPool[AsyncConnection[DictRow]], memoire: AsyncPostgresSaver, jours: int
) -> None:
    while True:
        try:
            supprimees = await purger(pool, memoire, jours)
            if supprimees:
                journal.info("Conversations inactives supprimées : %d", supprimees)
        except Exception as panne:  # la purge ne doit jamais arrêter le service
            journal.warning("Purge des conversations en échec : %s", type(panne).__name__)
        await asyncio.sleep(PERIODE_PURGE_SECONDES)


@asynccontextmanager
async def ouvrir_memoire(url: str, jours: int = JOURS_PAR_DEFAUT) -> AsyncGenerator[Memoire]:
    """La mémoire pour la vie du service : PostgreSQL, obligatoire (``IA_DATABASE_URL``)."""
    async with AsyncConnectionPool[AsyncConnection[DictRow]](
        url,
        min_size=1,
        max_size=10,
        open=False,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
    ) as pool:
        checkpointer = AsyncPostgresSaver(pool)
        await checkpointer.setup()  # crée les tables officielles au premier démarrage
        # Expiration native du Store : un fichier d'espace inactif depuis ``jours`` jours est supprimé par le balayeur.
        store = AsyncPostgresStore(pool, ttl=TTLConfig(default_ttl=jours * 24 * 60, refresh_on_read=True))
        await store.setup()
        await store.start_ttl_sweeper()
        purge = asyncio.create_task(_purge_reguliere(pool, checkpointer, jours))
        try:
            yield Memoire(checkpointer, store)
        finally:
            purge.cancel()
            await store.stop_ttl_sweeper()
