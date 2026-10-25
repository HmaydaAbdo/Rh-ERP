# ag-ui-langgraph ne publie pas de stubs : seules ces deux règles sont levées, et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Point d'entrée AG-UI (docs/ia.md, T7 et T8) : une question en entrée, le run de l'agent en événements SSE.

Le flux est produit par l'intégration officielle ``ag-ui-langgraph`` (``LangGraphAgent``) ; ce module n'ajoute que ce
qu'elle ne fait pas : l'identité (jeton de connexion échangé auprès de Spring, refus HTTP avant tout flux), la session
MCP du run et une frontière de sécurité sur les événements sortants :

- aucun événement ``RAW`` ni copie ``rawEvent`` (ils porteraient l'état interne : consignes, données complètes) ;
- ``RUN_ERROR`` remplacé par un message générique (l'intégration y recopie le texte de l'exception) ;
- les échos ``CUSTOM manually_emit_*`` de l'intégration sont retirés ; ``com.staport.mascot.state.v1`` reçoit sa
  séquence croissante et la corrélation du run.

Contrat vu par le client (AG-UI 1.0) : ``RUN_STARTED`` ; ``STEP_STARTED``/``STEP_FINISHED`` par nœud du graphe
(``preparer``, ``cibler``, ``choisir``, ``executer``, ``rediger``, ``verifier``, ``conclure``) ; chaque outil
``TOOL_CALL_START``/``ARGS``/``END`` ; la réponse **vérifiée** seulement (``TEXT_MESSAGE_*``) ;
``CUSTOM com.staport.answer.v1`` (abstention, motif, vue) ; ``STATE_SNAPSHOT``/``MESSAGES_SNAPSHOT`` (conversation
visible : question, appels, synthèse des résultats, réponse) ; ``RUN_FINISHED``. Seule la dernière question est lue
(pas d'historique en J1) ; outils et état envoyés par le client sont ignorés. Une déconnexion du client annule le run
et ferme la session MCP.
"""

import logging
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, Literal, Protocol, cast

import httpx
from ag_ui.core import (
    BaseEvent,
    CustomEvent,
    EventType,
    RunAgentInput,
    RunErrorEvent,
    RunStartedEvent,
    UserMessage,
)
from ag_ui.encoder import EventEncoder
from ag_ui_langgraph import LangGraphAgent
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from erp_rh_ia.agent import EVENEMENT_MASCOTTE, Agent, Humeur
from erp_rh_ia.outils import Outils, jeton_agent, ouvrir_outils

journal = logging.getLogger(__name__)

TAILLE_QUESTION = 2_000
ERREUR_PUBLIQUE = "L'assistant est momentanément indisponible. Réessayez ou ouvrez l'écran classique."
ECHOS_INTEGRATION = frozenset({"manually_emit_message", "manually_emit_tool_call", "manually_emit_state"})


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


class EtatMascotte(BaseModel):
    """État logique de la mascotte (conventions/agent-ui.md) ; jamais d'entrée Rive ni d'asset."""

    sequence: int = Field(ge=0)
    mood: Humeur
    action: Literal["idle"] = "idle"  # gestes et cibles A2UI avec l'Espace IA (J4)
    expiresInMs: int | None = Field(default=None, ge=0, le=10_000)


class AccesErp(Protocol):
    """Identité de l'utilisateur auprès de Spring : échange de jeton, puis session MCP à son nom."""

    async def jeton_agent(self, jeton_connexion: str) -> str: ...

    def outils(self, jeton_agent: str) -> AbstractAsyncContextManager[Outils]: ...


def question_de(entree: RunAgentInput) -> str:
    """La dernière question de l'utilisateur, en texte ; 422 si absente, vide ou trop longue."""
    dernier = entree.messages[-1] if entree.messages else None
    if not isinstance(dernier, UserMessage):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Le dernier message doit venir de l'utilisateur.")
    if isinstance(dernier.content, str):
        texte = dernier.content
    else:
        texte = " ".join(str(getattr(p, "text", "")) for p in dernier.content if getattr(p, "type", "") == "text")
    texte = texte.strip()
    if not texte or len(texte) > TAILLE_QUESTION:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"Question vide ou de plus de {TAILLE_QUESTION} caractères."
        )
    return texte


class _Frontiere:
    """Filtre et complète les événements de l'intégration avant qu'ils ne partent vers le navigateur."""

    def __init__(self, entree: RunAgentInput) -> None:
        self._entree = entree
        self._sequence = 0
        self.demarre = False

    def mascotte(self, humeur: Humeur) -> CustomEvent:
        self._sequence += 1
        etat = EtatMascotte(sequence=self._sequence, mood=humeur)
        correlation = {"com_staport": {"threadId": self._entree.thread_id, "runId": self._entree.run_id}}
        return CustomEvent(name=EVENEMENT_MASCOTTE, value=etat.model_dump(exclude_none=True), metadata=correlation)

    def filtrer(self, evenement: BaseEvent) -> BaseEvent | None:
        if evenement.type == EventType.RAW:
            return None
        if evenement.type == EventType.RUN_STARTED:
            self.demarre = True
        if isinstance(evenement, CustomEvent):
            if evenement.name in ECHOS_INTEGRATION:
                return None
            if evenement.name == EVENEMENT_MASCOTTE:
                valeur: Any = evenement.value
                humeur = cast(Humeur, valeur.get("mood", "neutral") if isinstance(valeur, dict) else "neutral")
                return self.mascotte(humeur)  # une humeur inconnue est refusée par EtatMascotte
        if evenement.raw_event is not None:
            evenement = evenement.model_copy(update={"raw_event": None})
        return evenement

    def erreur(self) -> list[BaseEvent]:
        debut: list[BaseEvent] = []
        if not self.demarre:
            debut.append(RunStartedEvent(thread_id=self._entree.thread_id, run_id=self._entree.run_id))
        return [*debut, self.mascotte("apologetic"), RunErrorEvent(message=ERREUR_PUBLIQUE, code="AGENT_INDISPONIBLE")]


class _RunEnEchec(Exception):
    """L'intégration a émis un RUN_ERROR : il est remplacé par l'erreur publique."""


async def evenements(
    entree: RunAgentInput, agent: Agent, session: AbstractAsyncContextManager[Outils]
) -> AsyncGenerator[BaseEvent]:
    """Le run complet en événements AG-UI ; toute panne, ouverture MCP comprise, devient un ``RUN_ERROR`` générique."""
    frontiere = _Frontiere(entree)
    try:
        async with session as outils:
            officiel = LangGraphAgent(
                name="erp-rh",
                graph=cast(Any, agent.graphe_pour_run()),  # typage de l'intégration : contexte None
                config={"configurable": {"outils": outils}, "recursion_limit": 40},
                emit_raw_events=False,
            )
            async for brut in officiel.run(entree):
                if brut.type == EventType.RUN_ERROR:
                    raise _RunEnEchec
                evenement = frontiere.filtrer(brut)
                if evenement is not None:
                    yield evenement
    except Exception as panne:  # le détail reste côté serveur, sans contenu RH
        journal.warning("Run %s en échec : %s", entree.run_id, type(panne).__name__)
        for evenement in frontiere.erreur():
            yield evenement


class AccesSpring:
    """``AccesErp`` réel : ``/auth/jetons/agent`` puis ``/mcp`` du backend, avec le client HTTP du service."""

    def __init__(self, client: httpx.AsyncClient, api: str) -> None:
        self._client = client
        self._api = api.rstrip("/")

    async def jeton_agent(self, jeton_connexion: str) -> str:
        return await jeton_agent(self._client, self._api, jeton_connexion)

    def outils(self, jeton_agent: str) -> AbstractAsyncContextManager[Outils]:
        return ouvrir_outils(f"{self._api}/mcp", jeton_agent)


def routeur_agui(agent: Callable[[], Agent], acces: Callable[[], AccesErp], actif: Callable[[], bool]) -> APIRouter:
    routeur = APIRouter()

    @routeur.post("/agui")
    async def executer(entree: RunAgentInput, requete: Request) -> StreamingResponse:  # pyright: ignore[reportUnusedFunction]
        if not actif():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA désactivé.")
        autorisation = requete.headers.get("authorization", "")
        if not autorisation.lower().startswith("bearer ") or not autorisation[7:].strip():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
        question_de(entree)
        erp = acces()
        jeton = await _jeton(erp, autorisation[7:].strip())
        encodeur = EventEncoder(accept=requete.headers.get("accept") or "text/event-stream")
        # Outils et état déclarés par le navigateur ne sont pas des capacités de l'agent : ignorés.
        entree_serveur = entree.model_copy(update={"tools": [], "state": {}})

        async def flux() -> AsyncIterator[str]:
            async for evenement in evenements(entree_serveur, agent(), erp.outils(jeton)):
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
