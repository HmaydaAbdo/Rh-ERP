"""Point d'entrée AG-UI (docs/ia.md, T7) : une question en entrée, le run de l'agent en événements SSE.

Contrat (AG-UI 1.0, ``ag-ui-protocol``) :

- ``RUN_STARTED`` puis, pour chaque nœud du graphe, ``STEP_STARTED``/``STEP_FINISHED`` (identifiants stables :
  ``cibler``, ``choisir``, ``executer``, ``rediger``, ``verifier`` ; le client les traduit) ;
- chaque outil : ``TOOL_CALL_START``/``ARGS``/``END`` puis ``TOOL_CALL_RESULT`` avec la synthèse lisible du résultat ;
- la réponse **vérifiée** seulement (``TEXT_MESSAGE_*``) : aucun brouillon ni jeton du modèle n'est diffusé, le
  vérificateur de chiffres passe avant ;
- ``CUSTOM com.staport.answer.v1`` (abstention, motif, vue proposée) et ``CUSTOM com.staport.mascot.state.v1`` ;
- ``RUN_FINISHED``, ou ``RUN_ERROR`` avec un message générique (aucune exception ni contenu interne).

Le service ne garde pas d'historique (J1) : seule la dernière question de l'utilisateur est lue. Les outils déclarés
par le client et l'état partagé sont ignorés. Une déconnexion du client annule le run et ferme la session MCP.
"""

import json
import logging
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, Literal, Protocol
from uuid import uuid4

import httpx
from ag_ui.core import (
    BaseEvent,
    CustomEvent,
    RunAgentInput,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StepFinishedEvent,
    StepStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
    UserMessage,
)
from ag_ui.encoder import EventEncoder
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from erp_rh_ia.agent import Agent, EtapeCommencee, OutilAppele, OutilTermine, ReponseAgent
from erp_rh_ia.outils import Outils, jeton_agent, ouvrir_outils

journal = logging.getLogger(__name__)

TAILLE_QUESTION = 2_000
ERREUR_PUBLIQUE = "L'assistant est momentanément indisponible. Réessayez ou ouvrez l'écran classique."

EVENEMENT_REPONSE = "com.staport.answer.v1"
EVENEMENT_MASCOTTE = "com.staport.mascot.state.v1"

Humeur = Literal["neutral", "attentive", "thinking", "searching", "found", "asking", "apologetic"]


class EtatMascotte(BaseModel):
    """État logique de la mascotte (conventions/agent-ui.md) ; jamais d'entrée Rive ni d'asset."""

    sequence: int = Field(ge=0)
    mood: Humeur
    action: Literal["idle"] = "idle"  # gestes et cibles A2UI avec l'Espace IA (J4)
    expiresInMs: int | None = Field(default=None, ge=0, le=10_000)


class Reponse(BaseModel):
    """Méta-données de la réponse pour le panneau : abstention et vue à proposer (ViewSpec de Spring)."""

    abstention: bool
    motif: str | None
    vue: dict[str, Any] | None


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


class Diffusion:
    """Traduit la progression de l'agent en événements AG-UI, dans l'ordre et avec une séquence de mascotte."""

    def __init__(self, entree: RunAgentInput) -> None:
        self._entree = entree
        self._sequence = 0
        self._etape: str | None = None

    def debut(self) -> list[BaseEvent]:
        return [
            RunStartedEvent(thread_id=self._entree.thread_id, run_id=self._entree.run_id),
            self.mascotte("thinking"),
        ]

    def etape(self, progression: EtapeCommencee) -> list[BaseEvent]:
        evenements = self._fin_etape()
        self._etape = progression.etape
        evenements.append(StepStartedEvent(step_name=progression.etape))
        return evenements

    def appel(self, progression: OutilAppele) -> list[BaseEvent]:
        appel = progression.appel
        return [
            self.mascotte("searching"),
            ToolCallStartEvent(tool_call_id=appel.identifiant, tool_call_name=appel.nom),
            ToolCallArgsEvent(tool_call_id=appel.identifiant, delta=json.dumps(appel.arguments, ensure_ascii=False)),
            ToolCallEndEvent(tool_call_id=appel.identifiant),
        ]

    def resultat(self, progression: OutilTermine) -> list[BaseEvent]:
        return [
            ToolCallResultEvent(
                message_id=str(uuid4()),
                tool_call_id=progression.appel.identifiant,
                content=progression.resultat.texte,
                role="tool",
            ),
            self.mascotte("apologetic" if progression.resultat.refuse else "found"),
        ]

    def reponse(self, reponse: ReponseAgent) -> list[BaseEvent]:
        message = str(uuid4())
        meta = Reponse(abstention=reponse.abstention, motif=reponse.motif, vue=reponse.vue)
        return [
            *self._fin_etape(),
            TextMessageStartEvent(message_id=message, role="assistant"),
            TextMessageContentEvent(message_id=message, delta=reponse.texte),
            TextMessageEndEvent(message_id=message),
            CustomEvent(name=EVENEMENT_REPONSE, value=meta.model_dump()),
            self.mascotte("apologetic" if reponse.abstention else "neutral"),
            RunFinishedEvent(thread_id=self._entree.thread_id, run_id=self._entree.run_id),
        ]

    def erreur(self) -> list[BaseEvent]:
        return [
            self.mascotte("apologetic"),
            RunErrorEvent(message=ERREUR_PUBLIQUE, code="AGENT_INDISPONIBLE"),
        ]

    def mascotte(self, humeur: Humeur) -> CustomEvent:
        self._sequence += 1
        etat = EtatMascotte(sequence=self._sequence, mood=humeur)
        correlation = {"com_staport": {"threadId": self._entree.thread_id, "runId": self._entree.run_id}}
        return CustomEvent(name=EVENEMENT_MASCOTTE, value=etat.model_dump(exclude_none=True), metadata=correlation)

    def _fin_etape(self) -> list[BaseEvent]:
        if self._etape is None:
            return []
        fin = StepFinishedEvent(step_name=self._etape)
        self._etape = None
        return [fin]


async def evenements(
    entree: RunAgentInput, question: str, agent: Agent, session: AbstractAsyncContextManager[Outils]
) -> AsyncGenerator[BaseEvent]:
    """Le run complet en événements AG-UI ; toute panne, ouverture MCP comprise, devient un ``RUN_ERROR`` générique."""
    diffusion = Diffusion(entree)
    for evenement in diffusion.debut():
        yield evenement
    try:
        async with session as outils:
            async for progression in agent.derouler(question, outils):
                if isinstance(progression, EtapeCommencee):
                    lot = diffusion.etape(progression)
                elif isinstance(progression, OutilAppele):
                    lot = diffusion.appel(progression)
                elif isinstance(progression, OutilTermine):
                    lot = diffusion.resultat(progression)
                else:
                    lot = diffusion.reponse(progression)
                for evenement in lot:
                    yield evenement
    except Exception as panne:  # le détail reste côté serveur, sans contenu RH
        journal.warning("Run %s en échec : %s", entree.run_id, type(panne).__name__)
        for evenement in diffusion.erreur():
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
        question = question_de(entree)
        erp = acces()
        jeton = await _jeton(erp, autorisation[7:].strip())
        encodeur = EventEncoder(accept=requete.headers.get("accept") or "text/event-stream")

        async def flux() -> AsyncIterator[str]:
            async for evenement in evenements(entree, question, agent(), erp.outils(jeton)):
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
