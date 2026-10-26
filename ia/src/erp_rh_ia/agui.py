# ag-ui-langgraph et copilotkit ne publient pas de stubs : seules ces deux règles sont levées, et seulement ici.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Point d'entrée AG-UI (docs/ia.md, T11) : ``LangGraphAGUIAgent`` de CopilotKit, sur l'intégration officielle
``ag-ui-langgraph``, diffuse le run de l'agent — raisonnement (``REASONING_*``), texte en flux, appels d'outils,
plan, état partagé (``verification``) et outils déclarés par le navigateur.

Ne restent ici que deux protections qu'aucun framework ne fournit :

- l'identité : le jeton de connexion est échangé auprès de Spring contre le jeton agent de l'utilisateur, avec un refus
  HTTP avant tout flux ;
- la sortie : aucun événement ``RAW`` ni copie ``rawEvent`` (ils porteraient l'état interne) et un ``RUN_ERROR``
  générique (l'intégration y recopie le texte de l'exception).
"""

import logging
from collections.abc import AsyncGenerator, AsyncIterator, Callable, Sequence
from typing import Any, Protocol, cast

import httpx
from ag_ui.core import BaseEvent, EventType, RunAgentInput, RunErrorEvent, RunStartedEvent, UserMessage
from ag_ui.encoder import EventEncoder
from copilotkit import LangGraphAGUIAgent
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from langchain_core.tools import BaseTool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.state import CompiledStateGraph

from erp_rh_ia.outils import jeton_agent, outils_erp

journal = logging.getLogger(__name__)

TAILLE_QUESTION = 2_000
ERREUR_PUBLIQUE = "L'assistant est momentanément indisponible. Réessayez ou ouvrez l'écran classique."

# L'agent d'un run, construit avec les outils MCP de l'utilisateur ; le checkpointer est celui de l'intégration.
FabriqueAgent = Callable[[Sequence[BaseTool], InMemorySaver], CompiledStateGraph[Any, Any, Any, Any]]


class _SansDetail(logging.Filter):
    """L'intégration journalise l'exception d'un run en échec : on garde le message, jamais la trace ni son texte."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info:
            nom = record.exc_info[0].__name__ if record.exc_info[0] else "Exception"
            record.msg = f"{record.getMessage()} ({nom})"
            record.args = None
            record.exc_info = None
            record.exc_text = None
        return True


logging.getLogger("ag_ui_langgraph").addFilter(_SansDetail())


class AccesErp(Protocol):
    """Identité de l'utilisateur auprès de Spring : échange de jeton, puis outils MCP à son nom."""

    async def jeton_agent(self, jeton_connexion: str) -> str: ...

    async def outils(self, jeton_agent: str) -> Sequence[BaseTool]: ...


def verifier_question(entree: RunAgentInput) -> None:
    """422 si le dernier message n'est pas une question de l'utilisateur, ou s'il est vide ou trop long."""
    dernier = entree.messages[-1] if entree.messages else None
    if not isinstance(dernier, UserMessage):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Le dernier message doit venir de l'utilisateur.")
    if isinstance(dernier.content, str):
        texte = dernier.content
    else:
        texte = " ".join(str(getattr(p, "text", "")) for p in dernier.content if getattr(p, "type", "") == "text")
    if not texte.strip() or len(texte) > TAILLE_QUESTION:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Question vide ou de plus de {TAILLE_QUESTION} caractères."
        )


async def evenements(entree: RunAgentInput, fabrique: FabriqueAgent, outils: Sequence[BaseTool]) -> AsyncGenerator[BaseEvent]:
    """Le run en événements AG-UI ; toute panne devient un ``RUN_ERROR`` générique, sans détail."""
    demarre = False
    try:
        officiel = LangGraphAGUIAgent(
            name="erp-rh",
            graph=fabrique(outils, InMemorySaver()),  # conversation du run seulement (mémoire durable : T3.2)
            # Garde-fou technique de LangGraph, au-dessus des plafonds de l'agent (8 appels de modèle et d'outils) :
            # chaque middleware est un nœud du graphe, ce sont ces plafonds qui arrêtent un run.
            config={"recursion_limit": 200},
        )
        async for brut in officiel.run(entree):
            evenement = cast(BaseEvent, brut)
            if evenement.type == EventType.RUN_ERROR:
                raise RuntimeError("RUN_ERROR")
            if evenement.type == EventType.RAW:
                continue
            demarre = demarre or evenement.type == EventType.RUN_STARTED
            yield evenement.model_copy(update={"raw_event": None}) if evenement.raw_event is not None else evenement
    except Exception as panne:  # le détail reste côté serveur, sans contenu RH
        journal.warning("Run %s en échec : %s", entree.run_id, type(panne).__name__)
        if not demarre:
            yield RunStartedEvent(thread_id=entree.thread_id, run_id=entree.run_id)
        yield RunErrorEvent(message=ERREUR_PUBLIQUE, code="AGENT_INDISPONIBLE")


class AccesSpring:
    """``AccesErp`` réel : ``/auth/jetons/agent`` puis ``/mcp`` du backend."""

    def __init__(self, client: httpx.AsyncClient, api: str) -> None:
        self._client = client
        self._api = api.rstrip("/")

    async def jeton_agent(self, jeton_connexion: str) -> str:
        return await jeton_agent(self._client, self._api, jeton_connexion)

    async def outils(self, jeton_agent: str) -> Sequence[BaseTool]:
        return await outils_erp(f"{self._api}/mcp", jeton_agent)


def routeur_agui(fabrique: Callable[[], FabriqueAgent], acces: Callable[[], AccesErp], actif: Callable[[], bool]) -> APIRouter:
    routeur = APIRouter()

    @routeur.post("/agui")
    async def executer(entree: RunAgentInput, requete: Request) -> StreamingResponse:  # pyright: ignore[reportUnusedFunction]
        if not actif():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA désactivé.")
        autorisation = requete.headers.get("authorization", "")
        if not autorisation.lower().startswith("bearer ") or not autorisation[7:].strip():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
        verifier_question(entree)
        erp = acces()
        jeton = await _jeton(erp, autorisation[7:].strip())
        outils = await _outils(erp, jeton)
        encodeur = EventEncoder(accept=requete.headers.get("accept") or "text/event-stream")
        # L'état envoyé par le navigateur n'est pas une source de confiance ; ses outils déclarés (ouverture de vue,
        # A2UI) sont exécutés par le navigateur lui-même, jamais par le serveur.
        entree_serveur = entree.model_copy(update={"state": {}})

        async def flux() -> AsyncIterator[str]:
            async for evenement in evenements(entree_serveur, fabrique(), outils):
                yield encodeur.encode(evenement)

        return StreamingResponse(
            flux(),
            media_type=encodeur.get_content_type(),
            # Pas de mise en tampon par un proxy (nginx) : chaque événement part à son émission.
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    return routeur


async def _jeton(erp: AccesErp, jeton_connexion: str) -> str:
    """Les refus de Spring gardent leur sens HTTP ; le reste est une indisponibilité, sans détail."""
    try:
        return await erp.jeton_agent(jeton_connexion)
    except httpx.HTTPStatusError as refus:
        code = refus.response.status_code
        if code == status.HTTP_401_UNAUTHORIZED:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion expirée.") from None
        if code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Droit IA_UTILISER requis.") from None
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA indisponible.") from None
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA indisponible.") from None


async def _outils(erp: AccesErp, jeton: str) -> Sequence[BaseTool]:
    try:
        return await erp.outils(jeton)
    except Exception as panne:  # Spring injoignable ou catalogue refusé : indisponibilité, sans détail
        journal.warning("Catalogue MCP indisponible : %s", type(panne).__name__)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA indisponible.") from None
