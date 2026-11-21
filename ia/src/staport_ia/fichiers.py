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

import base64
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from deepagents.middleware.memory import MemoryState
from fastapi import APIRouter, HTTPException, Request, Response, status
from langchain.agents.middleware import AgentMiddleware
from langchain.tools.tool_node import ToolCallRequest
from langchain_core.messages import ToolMessage
from langgraph.runtime import Runtime
from langgraph.store.base import BaseStore
from langgraph.types import Command
from pydantic import BaseModel

from staport_ia.agui import SIGNALEUR_ECRITURE, AccesErp, _jeton  # pyright: ignore[reportPrivateUsage]
from staport_ia.memoire import proprietaire, rapatrier

journal = logging.getLogger(__name__)

#: Taille maximale d'un fichier écrit par l'agent (caractères) et nombre maximal de fichiers par utilisateur.
TAILLE_MAX_FICHIER = 200_000
FICHIERS_MAX = 50
#: Types des documents Office de l'agent (``bureautique.py``), stockés en base64 ; tout autre fichier est du texte.
TYPES_OFFICE = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
#: La mémoire longue est un seul fichier toujours chargé dans le prompt : elle reste courte (KAN-84).
FICHIER_MEMOIRE = "/memoire/AGENTS.md"
TAILLE_MAX_MEMOIRE = 4_000
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
        self._memoire = (utilisateur, "memoire")

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        appel = request.tool_call
        if appel["name"] not in OUTILS_ECRITURE:
            return await handler(request)
        contenu = str(appel["args"].get("content") or appel["args"].get("new_string") or "")
        chemin = str(appel["args"].get("file_path", ""))
        if chemin.startswith("/memoire/"):
            return await self._ecrire_memoire(request, handler, chemin, contenu)
        if len(contenu) > TAILLE_MAX_FICHIER:
            return _refus(appel, f"Fichier trop gros ({TAILLE_MAX_FICHIER} caractères au plus).")
        store: BaseStore | None = getattr(request.runtime, "store", None)
        if store is not None and chemin.startswith("/espace/"):
            existants = await store.asearch(self._espace, limit=FICHIERS_MAX + 1)
            cles = {item.key for item in existants}
            if len(cles) >= FICHIERS_MAX and chemin.removeprefix("/espace") not in cles:
                return _refus(appel, f"Espace plein ({FICHIERS_MAX} fichiers au plus) : supprimez-en avant d'écrire.")
        resultat = await handler(request)
        if chemin.startswith("/espace/") and _reussie(resultat):
            await _signaler(chemin, len(contenu), appel["name"])
        return resultat

    async def _ecrire_memoire(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
        chemin: str,
        contenu: str,
    ) -> ToolMessage | Command[Any]:
        """La mémoire longue : un seul fichier, court ; l'accord a déjà eu lieu (interruption avant l'outil)."""
        appel = request.tool_call
        if chemin != FICHIER_MEMOIRE:
            return _refus(appel, f"La mémoire est le seul fichier {FICHIER_MEMOIRE}.")
        total = len(contenu)
        store: BaseStore | None = getattr(request.runtime, "store", None)
        if appel["name"] == "edit_file" and store is not None:  # une modification s'ajoute à l'existant
            existant = await store.aget(self._memoire, "/AGENTS.md")
            total += len(str(existant.value.get("content", ""))) if existant else 0
        if total > TAILLE_MAX_MEMOIRE:
            return _refus(appel, f"Mémoire trop longue ({TAILLE_MAX_MEMOIRE} caractères au plus) : résume-la.")
        resultat = await handler(request)
        if _reussie(resultat):
            await _signaler(chemin, len(contenu), appel["name"])
        return resultat


class MemoireFraiche(AgentMiddleware[MemoryState, Any, Any]):
    """Relit la mémoire longue de l'utilisateur au début de chaque run (KAN-84, KAN-86).

    Le ``MemoryMiddleware`` officiel de Deep Agents ne charge ``AGENTS.md`` qu'une fois par conversation et le garde
    dans
    l'état du fil : sans cette relecture, un « tout oublier » ou une correction du panneau ne s'appliquerait pas aux
    conversations déjà commencées. L'état du fil n'est donc jamais la source de la mémoire : c'est le Store."""

    state_schema = MemoryState

    def __init__(self, utilisateur: str) -> None:
        super().__init__()
        self._memoire = (utilisateur, "memoire")

    async def abefore_agent(self, state: MemoryState, runtime: Runtime[Any]) -> dict[str, Any] | None:
        if runtime.store is None:
            return None
        element = await runtime.store.aget(self._memoire, "/AGENTS.md")
        contenu = str(element.value.get("content", "")) if element else ""
        voulu = {FICHIER_MEMOIRE: contenu} if contenu.strip() else {}
        return None if state.get("memory_contents") == voulu else {"memory_contents": voulu}


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


def _taille(valeur: dict[str, Any]) -> int:
    """La taille du fichier en octets : celle du binaire décodé pour un document Office, sinon celle du texte."""
    contenu = str(valeur.get("content", ""))
    if valeur.get("encoding") == "base64":
        return len(contenu) * 3 // 4 - (len(contenu) - len(contenu.rstrip("=")))
    return len(contenu)


def _contenu(valeur: dict[str, Any], nom: str) -> tuple[bytes, str]:
    """Les octets et le type d'un fichier de l'espace : un document Office est décodé, un texte reste du texte."""
    if valeur.get("encoding") == "base64":
        extension = "." + nom.rsplit(".", 1)[-1].lower() if "." in nom else ""
        return base64.b64decode(str(valeur.get("content", ""))), TYPES_OFFICE.get(extension, "application/octet-stream")
    return str(valeur.get("content", "")).encode(), "text/plain; charset=utf-8"


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
        jeton = await _jeton(acces(), autorisation[7:].strip())
        await rapatrier(store(), jeton)
        return proprietaire(jeton)

    @routeur.get("/fichiers")
    async def lister(requete: Request) -> list[Fichier]:  # pyright: ignore[reportUnusedFunction]
        proprietaire = await utilisateur(requete)
        elements = await store().asearch((proprietaire, "espace"), limit=FICHIERS_MAX)
        return [
            Fichier(chemin=f"/espace{e.key}", taille=_taille(e.value), modifie=e.updated_at.isoformat())
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
        contenu, type_media = _contenu(element.value, nom)
        return Response(
            content=contenu,
            media_type=type_media,
            headers={
                "Content-Disposition": f'attachment; filename="{nom}"',
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    return routeur
