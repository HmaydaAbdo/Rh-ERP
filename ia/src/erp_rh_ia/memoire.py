# LangGraph et ses intégrations ne publient pas de stubs complets : seules ces deux règles sont levées, et seulement
# pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Conversations durables de l'assistant (docs/ia.md, T19).

Le checkpointer officiel de LangGraph pour PostgreSQL (``AsyncPostgresSaver``) garde l'état de chaque conversation
dans une base dédiée à l'IA (service ``ia-db``, aucune donnée du reste de l'ERP) : une question posée après un
redémarrage, ou le lendemain, retrouve son fil. Sans ``IA_DATABASE_URL`` (tests, développement), la mémoire reste celle
du processus (``InMemorySaver``).

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
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg import AsyncConnection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import AsyncConnectionPool

journal = logging.getLogger(__name__)

#: Une conversation sans nouvel échange depuis ce nombre de jours est supprimée.
JOURS_PAR_DEFAUT = 30
PERIODE_PURGE_SECONDES = 24 * 3600


def sujet(jeton_agent: str) -> str:
    """L'identité portée par le jeton agent (champ ``sub``), émis à l'instant par Spring pour l'utilisateur connecté.

    Un jeton illisible (doubles de test) donne une empreinte : l'espace reste propre à ce jeton, jamais partagé.
    """
    try:
        charge = jeton_agent.split(".")[1]
        sub = json.loads(base64.urlsafe_b64decode(charge + "=" * (-len(charge) % 4))).get("sub")
        if isinstance(sub, str) and sub:
            return sub
    except (IndexError, ValueError):
        pass
    return "anonyme-" + hashlib.sha256(jeton_agent.encode()).hexdigest()[:16]


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
async def ouvrir_memoire(url: str | None, jours: int = JOURS_PAR_DEFAUT) -> AsyncGenerator[BaseCheckpointSaver[Any]]:
    """La mémoire des conversations pour la vie du service : PostgreSQL si ``url``, sinon celle du processus."""
    if not url:
        yield InMemorySaver()
        return
    async with AsyncConnectionPool[AsyncConnection[DictRow]](
        url,
        min_size=1,
        max_size=10,
        open=False,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
    ) as pool:
        memoire = AsyncPostgresSaver(pool)
        await memoire.setup()  # crée les tables officielles au premier démarrage
        purge = asyncio.create_task(_purge_reguliere(pool, memoire, jours))
        try:
            yield memoire
        finally:
            purge.cancel()
