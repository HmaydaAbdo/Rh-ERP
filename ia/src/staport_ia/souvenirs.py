# LangGraph et ses intégrations ne publient pas de stubs complets : seules ces règles sont levées, pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Consultation, correction et oubli de la mémoire longue de l'utilisateur (site/docs/ia, KAN-84).

L'assistant retient des préférences et des faits métier dans un fichier ``AGENTS.md`` (paramètre officiel ``memory``
de Deep Agents), stocké dans le Store PostgreSQL sous l'identité du jeton agent, avec l'expiration native du Store.
L'agent n'y écrit qu'avec l'accord de l'utilisateur (``agent.py``). Ces routes donnent à l'utilisateur la main
directe : lire, corriger, tout oublier. L'identité vient de l'échange de jeton, jamais d'un paramètre ; chaque
modification est journalisée (chemin, taille, jamais le contenu).
"""

import logging
from collections.abc import Callable
from typing import Annotated

from deepagents.backends.utils import create_file_data
from fastapi import APIRouter, HTTPException, Request, Response, status
from langgraph.store.base import BaseStore
from pydantic import BaseModel, Field

from staport_ia.agui import AccesErp, _jeton  # pyright: ignore[reportPrivateUsage]
from staport_ia.fichiers import FICHIER_MEMOIRE, TAILLE_MAX_MEMOIRE
from staport_ia.memoire import sujet

journal = logging.getLogger(__name__)

CLE = "/AGENTS.md"


class Souvenirs(BaseModel):
    contenu: str
    modifie: str | None = None


class Correction(BaseModel):
    contenu: Annotated[str, Field(max_length=TAILLE_MAX_MEMOIRE)]


def routeur_souvenirs(
    acces: Callable[[], AccesErp], actif: Callable[[], bool], store: Callable[[], BaseStore]
) -> APIRouter:
    routeur = APIRouter()

    async def identite(requete: Request) -> tuple[str, str]:
        if not actif():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA désactivé.")
        autorisation = requete.headers.get("authorization", "")
        if not autorisation.lower().startswith("bearer ") or not autorisation[7:].strip():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
        jeton = await _jeton(acces(), autorisation[7:].strip())
        return sujet(jeton), jeton

    async def journaliser(jeton: str, taille: int, outil: str) -> None:
        try:
            await acces().signaler_ecriture(jeton, FICHIER_MEMOIRE, taille, outil)
        except Exception as panne:  # le journal ne bloque pas l'action de l'utilisateur
            journal.warning("Modification de la mémoire non journalisée : %s", type(panne).__name__)

    @routeur.get("/memoire")
    async def lire(requete: Request) -> Souvenirs:  # pyright: ignore[reportUnusedFunction]
        proprietaire, _ = await identite(requete)
        element = await store().aget((proprietaire, "memoire"), CLE)
        if element is None:
            return Souvenirs(contenu="")
        return Souvenirs(contenu=str(element.value.get("content", "")), modifie=element.updated_at.isoformat())

    @routeur.put("/memoire", status_code=status.HTTP_204_NO_CONTENT)
    async def corriger(correction: Correction, requete: Request) -> Response:  # pyright: ignore[reportUnusedFunction]
        proprietaire, jeton = await identite(requete)
        espace = (proprietaire, "memoire")
        if correction.contenu.strip():
            await store().aput(espace, CLE, create_file_data(correction.contenu))
            await journaliser(jeton, len(correction.contenu), "memoire_modifier")
        else:  # un contenu vide revient à tout oublier
            await store().adelete(espace, CLE)
            await journaliser(jeton, 0, "memoire_oublier")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @routeur.delete("/memoire", status_code=status.HTTP_204_NO_CONTENT)
    async def oublier(requete: Request) -> Response:  # pyright: ignore[reportUnusedFunction]
        proprietaire, jeton = await identite(requete)
        await store().adelete((proprietaire, "memoire"), CLE)
        await journaliser(jeton, 0, "memoire_oublier")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return routeur
