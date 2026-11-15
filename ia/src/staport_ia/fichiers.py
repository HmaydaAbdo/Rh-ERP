# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces règles sont levées, et
# seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
# pyright: reportUnknownParameterType=false, reportMissingParameterType=false, reportUnknownArgumentType=false
"""Fichiers de l'espace de l'utilisateur : téléchargement authentifié et bornes d'écriture (KAN-267).

L'agent écrit sous ``/espace/`` (avec l'accord de l'utilisateur, ``agent.py``) ; ces fichiers vivent dans le Store
PostgreSQL, sous l'identité du jeton agent. Le navigateur les récupère ici, avec son jeton de connexion : l'identité
vient de l'échange de jeton, jamais du chemin ni d'un paramètre. Un fichier d'un autre utilisateur est introuvable.

Deux bornes sont à nous, parce qu'aucun framework ne les fournit : la taille d'un fichier et le nombre de fichiers par
utilisateur (``QuotaEspace``, crochet officiel ``wrap_tool_call``, appliqué à l'exécution, après l'accord) ;
l'expiration est celle du Store (``memoire.py``).
"""

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from langchain.agents.middleware import AgentMiddleware
from langchain.tools.tool_node import ToolCallRequest
from langchain_core.messages import ToolMessage
from langgraph.store.base import BaseStore
from langgraph.types import Command
from pydantic import BaseModel

from staport_ia.agui import SIGNALEUR_ECRITURE, AccesErp, _jeton  # pyright: ignore[reportPrivateUsage]
from staport_ia.memoire import sujet

journal = logging.getLogger(__name__)

#: Taille maximale d'un fichier écrit par l'agent (caractères) et nombre maximal de fichiers par utilisateur.
TAILLE_MAX_FICHIER = 200_000
FICHIERS_MAX = 50
OUTILS_ECRITURE = frozenset({"write_file", "edit_file"})


class Fichier(BaseModel):
    chemin: str
    taille: int
    modifie: str


class QuotaEspace(AgentMiddleware[Any, Any, Any]):
    """Refuse à l'exécution (donc après l'accord de l'utilisateur : l'interruption a lieu avant l'outil) une écriture
    trop grosse ou au-delà du nombre de fichiers permis ; le modèle voit le motif et l'explique."""

    def __init__(self, utilisateur: str) -> None:
        super().__init__()
        self._espace = (utilisateur, "espace")

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        appel = request.tool_call
        if appel["name"] not in OUTILS_ECRITURE:
            return await handler(request)
        contenu = str(appel["args"].get("content") or appel["args"].get("new_string") or "")
        if len(contenu) > TAILLE_MAX_FICHIER:
            return _refus(appel, f"Fichier trop gros ({TAILLE_MAX_FICHIER} caractères au plus).")
        store: BaseStore | None = getattr(request.runtime, "store", None)
        chemin = str(appel["args"].get("file_path", ""))
        if store is not None and chemin.startswith("/espace/"):
            existants = await store.asearch(self._espace, limit=FICHIERS_MAX + 1)
            cles = {item.key for item in existants}
            if len(cles) >= FICHIERS_MAX and chemin.removeprefix("/espace") not in cles:
                return _refus(appel, f"Espace plein ({FICHIERS_MAX} fichiers au plus) : supprimez-en avant d'écrire.")
        resultat = await handler(request)
        if chemin.startswith("/espace/") and _reussie(resultat):
            await _signaler(chemin, len(contenu), appel["name"])
        return resultat


def _reussie(resultat: ToolMessage | Command[Any]) -> bool:
    if isinstance(resultat, ToolMessage):
        return resultat.status != "error" and not str(resultat.content).startswith("Error")
    return True


async def _signaler(chemin: str, taille: int, outil: str) -> None:
    """Journalise l'écriture dans l'audit de l'API (chemin, taille, outil ; jamais le contenu). Une panne du
    signalement n'interrompt pas le run : elle est consignée côté serveur."""
    signaleur = SIGNALEUR_ECRITURE.get()
    if signaleur is None:
        return
    try:
        await signaleur(chemin, taille, outil)
    except Exception as panne:
        journal.warning("Écriture de fichier non journalisée : %s", type(panne).__name__)


def _refus(appel: Any, message: str) -> ToolMessage:
    return ToolMessage(content=message, tool_call_id=appel["id"], name=appel["name"], status="error")


def _chemin_sur(chemin: str) -> str:
    """Le chemin dans l'espace de l'utilisateur ; ``..`` et les chemins vides sont refusés (le Store n'est pas un
    système de fichiers, mais un chemin piégé n'a aucune raison d'exister)."""
    morceaux = chemin.strip("/").split("/")
    if not chemin.strip("/") or any(m in {"", ".", ".."} for m in morceaux):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fichier introuvable.")
    return "/" + "/".join(morceaux)


def routeur_fichiers(
    acces: Callable[[], AccesErp], actif: Callable[[], bool], store: Callable[[], BaseStore]
) -> APIRouter:
    routeur = APIRouter()

    async def utilisateur(requete: Request) -> str:
        if not actif():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA désactivé.")
        autorisation = requete.headers.get("authorization", "")
        if not autorisation.lower().startswith("bearer ") or not autorisation[7:].strip():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
        return sujet(await _jeton(acces(), autorisation[7:].strip()))

    @routeur.get("/fichiers")
    async def lister(requete: Request) -> list[Fichier]:  # pyright: ignore[reportUnusedFunction]
        proprietaire = await utilisateur(requete)
        elements = await store().asearch((proprietaire, "espace"), limit=FICHIERS_MAX)
        return [
            Fichier(
                chemin=f"/espace{e.key}", taille=len(str(e.value.get("content", ""))), modifie=e.updated_at.isoformat()
            )
            for e in sorted(elements, key=lambda e: e.key)
        ]

    @routeur.get("/fichiers/{chemin:path}")
    async def telecharger(chemin: str, requete: Request) -> Response:  # pyright: ignore[reportUnusedFunction]
        proprietaire = await utilisateur(requete)
        cle = _chemin_sur(chemin.removeprefix("espace/"))
        element = await store().aget((proprietaire, "espace"), cle)
        if element is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Fichier introuvable.")
        nom = cle.rsplit("/", 1)[-1].replace('"', "")
        return Response(
            content=str(element.value.get("content", "")).encode(),
            media_type="text/plain; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{nom}"',
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    return routeur
