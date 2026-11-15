# ag-ui-langgraph et copilotkit ne publient pas de stubs : seules ces deux règles sont levées, et seulement ici.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Point d'entrée AG-UI (site/docs/ia, T11) : ``LangGraphAGUIAgent`` de CopilotKit, sur l'intégration officielle
``ag-ui-langgraph``, diffuse le run de l'agent — raisonnement (``REASONING_*``), texte en flux, appels d'outils,
plan, état partagé et outils déclarés par le navigateur.

Ne restent ici que deux protections qu'aucun framework ne fournit :

- l'identité : l'API ERP échange le jeton de connexion contre celui de l'agent, avec un refus HTTP avant tout flux ;
- la sortie : aucun événement ``RAW`` ni copie ``rawEvent`` (ils porteraient l'état interne) et un ``RUN_ERROR``
  générique (l'intégration y recopie le texte de l'exception).
"""

import logging
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable, Sequence
from contextvars import ContextVar
from typing import Any, Protocol, cast

import httpx
from ag_ui.core import BaseEvent, EventType, RunAgentInput, RunErrorEvent, RunStartedEvent, UserMessage
from ag_ui.encoder import EventEncoder
from copilotkit import LangGraphAGUIAgent
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.runtime import RunControl
from langgraph.types import Durability

from staport_ia.memoire import espace_conversation, sujet
from staport_ia.outils import jeton_agent, outils_erp

journal = logging.getLogger(__name__)

TAILLE_QUESTION = 2_000
MESSAGE_REDEMARRAGE = "Le service redémarre : votre conversation est conservée, renvoyez votre message dans un instant."
ERREUR_PUBLIQUE = "L'assistant est momentanément indisponible. Réessayez ou ouvrez l'écran classique."

# L'agent d'un run, construit avec les outils MCP de l'utilisateur ; le checkpointer est celui de l'intégration.
FabriqueAgent = Callable[
    [Sequence[BaseTool], BaseCheckpointSaver[Any] | None, str], CompiledStateGraph[Any, Any, Any, Any]
]

# Routage hors modèle : les compétences de domaine à épingler pour la question (``routage.py``, sans appel de modèle).
Routage = Callable[[str, Sequence[BaseTool]], Awaitable[list[str]]]


#: Durabilité des points de reprise (doc LangGraph, « Durability modes ») : ``sync`` écrit chaque point avant l'étape
#: suivante, donc un run repris après un arrêt ou une panne repart de la dernière étape terminée (KAN-39).
DURABILITE: Durability = "sync"

#: Les runs en cours dans ce processus : à l'arrêt du service, chacun termine son étape puis s'arrête proprement.
ARRETS_EN_COURS: set[RunControl] = set()


def demander_arret(motif: str = "sigterm") -> int:
    """Demande l'arrêt coopératif de tous les runs en cours (doc LangGraph, « Graceful shutdown ») : chaque run
    termine son étape, enregistre un point de reprise et lève ``GraphDrained``. Rend le nombre de runs concernés."""
    en_cours = list(ARRETS_EN_COURS)
    for controle in en_cours:
        controle.request_drain(motif)
    return len(en_cours)


class AgentAGUI(LangGraphAGUIAgent):
    """``LangGraphAGUIAgent`` officiel, qui transmet à LangGraph la durabilité et le ``RunControl`` du run.

    L'intégration ne les expose pas (elle appelle ``astream_events`` sans ``control`` ni ``durability``) : cette
    sous-classe n'ajoute que ces deux arguments au point d'extension ``get_stream_kwargs``. Écart au 0 % de code maison
    à retirer quand l'intégration les prendra en charge (registre des abstractions, KAN-39)."""

    def __init__(self, *args: Any, controle: RunControl, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._controle = controle

    def get_stream_kwargs(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        return {**super().get_stream_kwargs(*args, **kwargs), "control": self._controle, "durability": DURABILITE}


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
    """Identité de l'utilisateur auprès de l'API ERP : échange de jeton, puis outils MCP à son nom."""

    async def jeton_agent(self, jeton_connexion: str) -> str: ...

    async def outils(self, jeton_agent: str) -> Sequence[BaseTool]: ...

    async def signaler_ecriture(self, jeton_agent: str, chemin: str, taille: int, outil: str) -> None: ...


#: Le signalement des écritures de fichier de l'agent (KAN-268) : posé par le run en cours (jamais partagé entre
#: utilisateurs, une ``ContextVar`` suit la tâche), lu par ``QuotaEspace`` après chaque écriture réussie.
SignalerEcriture = Callable[[str, int, str], Awaitable[None]]
SIGNALEUR_ECRITURE: ContextVar[SignalerEcriture | None] = ContextVar("signaleur_ecriture", default=None)


def texte_question(entree: RunAgentInput) -> str:
    """Le texte de la dernière question de l'utilisateur (une reprise d'interruption n'apporte pas de question)."""
    for message in reversed(entree.messages):
        if isinstance(message, UserMessage):
            if isinstance(message.content, str):
                return message.content
            return " ".join(str(getattr(p, "text", "")) for p in message.content if getattr(p, "type", "") == "text")
    return ""


def est_reprise(entree: RunAgentInput) -> bool:
    """Un run qui répond à une interruption de l'agent (accord avant écriture) : ``RunAgentInput.resume`` du protocole
    AG-UI, ou la commande de reprise historique de ``forwardedProps``."""
    proprietes = cast(dict[str, Any], entree.forwarded_props) if isinstance(entree.forwarded_props, dict) else {}
    commande = proprietes.get("command")
    return bool(entree.resume) or (
        isinstance(commande, dict) and cast(dict[str, Any], commande).get("resume") is not None
    )


def verifier_question(entree: RunAgentInput) -> None:
    """422 si le dernier message n'est pas une question de l'utilisateur, ou s'il est vide ou trop long. La réponse à
    une question de l'agent (``poser_question``) et l'accord avant écriture sont des reprises d'interruption : elles
    n'apportent pas de nouvelle question et sont vérifiées par le fil propre à l'utilisateur, jamais par leur texte."""
    if est_reprise(entree):
        return
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


async def evenements(
    entree: RunAgentInput,
    fabrique: FabriqueAgent,
    outils: Sequence[BaseTool],
    memoire: BaseCheckpointSaver[Any] | None = None,
    thread_id: str | None = None,
    utilisateur: str = "anonyme",
) -> AsyncGenerator[BaseEvent]:
    """Le run en événements AG-UI ; toute panne devient un ``RUN_ERROR`` générique, sans détail.

    ``entree`` porte le fil propre à l'utilisateur ; les événements rendent au navigateur l'identifiant qu'il a
    envoyé (``thread_id``)."""
    demarre = False
    controle = RunControl()
    ARRETS_EN_COURS.add(controle)
    try:
        officiel = AgentAGUI(
            controle=controle,
            name="staport-intelligence",
            graph=fabrique(
                outils, memoire or InMemorySaver(), utilisateur
            ),  # mémoire durable (memoire.py) ou celle du run
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
            if thread_id is not None and hasattr(evenement, "thread_id"):
                evenement = evenement.model_copy(update={"thread_id": thread_id})
            yield evenement.model_copy(update={"raw_event": None}) if evenement.raw_event is not None else evenement
    except Exception as panne:  # le détail reste côté serveur, sans contenu RH
        arret = controle.drain_requested
        if arret:
            journal.info("Run %s arrêté proprement (%s), reprise possible", entree.run_id, controle.drain_reason)
        else:
            journal.warning("Run %s en échec : %s", entree.run_id, type(panne).__name__)
        if not demarre:
            yield RunStartedEvent(thread_id=entree.thread_id, run_id=entree.run_id)
        yield RunErrorEvent(
            message=MESSAGE_REDEMARRAGE if arret else ERREUR_PUBLIQUE,
            code="SERVICE_REDEMARRE" if arret else "AGENT_INDISPONIBLE",
        )
    finally:
        ARRETS_EN_COURS.discard(controle)


class AccesHttp:
    """``AccesErp`` réel : ``/auth/jetons/agent`` puis ``/mcp`` de l'API ERP."""

    def __init__(self, client: httpx.AsyncClient, api: str) -> None:
        self._client = client
        self._api = api.rstrip("/")

    async def jeton_agent(self, jeton_connexion: str) -> str:
        return await jeton_agent(self._client, self._api, jeton_connexion)

    async def outils(self, jeton_agent: str) -> Sequence[BaseTool]:
        return await outils_erp(f"{self._api}/mcp", jeton_agent)

    async def signaler_ecriture(self, jeton_agent: str, chemin: str, taille: int, outil: str) -> None:
        reponse = await self._client.post(
            f"{self._api}/interne/ia/ecritures-fichier",
            json={"chemin": chemin, "taille": taille, "outil": outil},
            headers={"Authorization": f"Bearer {jeton_agent}"},
        )
        reponse.raise_for_status()


def routeur_agui(
    fabrique: Callable[[], FabriqueAgent],
    acces: Callable[[], AccesErp],
    actif: Callable[[], bool],
    memoire: Callable[[], BaseCheckpointSaver[Any]] | None = None,
    routage: Callable[[], Routage] | None = None,
) -> APIRouter:
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
        # L'état envoyé par le navigateur n'est pas une source de confiance ; les outils qu'il déclare (rendu A2UI du
        # runtime CopilotKit) sont exécutés côté client, jamais par le serveur.
        # Le fil est celui de cet utilisateur : l'identifiant de conversation du navigateur n'est jamais pris tel quel.
        fil = espace_conversation(sujet(jeton), entree.thread_id)
        # Les compétences épinglées sont choisies ici, hors modèle, jamais prises de l'état envoyé par le navigateur.
        # Une reprise garde l'état du fil (compétences déjà épinglées) : le navigateur n'y apporte rien.
        if est_reprise(entree):
            entree_serveur = entree.model_copy(update={"state": {}, "thread_id": fil})
        else:
            epinglees = await routage()(texte_question(entree), outils) if routage else []
            entree_serveur = entree.model_copy(update={"state": {"pinned_skills": epinglees}, "thread_id": fil})

        suggestion_sans_etat = requete.headers.get("x-staport-stateless-suggestion") == "true"

        async def signaler(chemin: str, taille: int, outil: str) -> None:
            await erp.signaler_ecriture(jeton, chemin, taille, outil)

        async def flux() -> AsyncIterator[str]:
            reperage = SIGNALEUR_ECRITURE.set(signaler)
            try:
                async for evenement in evenements(
                    entree_serveur,
                    fabrique(),
                    outils,
                    memoire() if memoire and not suggestion_sans_etat else None,
                    entree.thread_id,
                    sujet(jeton),
                ):
                    yield encodeur.encode(evenement)
            finally:
                try:
                    SIGNALEUR_ECRITURE.reset(reperage)
                except ValueError:  # générateur fermé dans un autre contexte : le run est terminé de toute façon
                    pass

        return StreamingResponse(
            flux(),
            media_type=encodeur.get_content_type(),
            # Pas de mise en tampon par un proxy (nginx) : chaque événement part à son émission.
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    return routeur


async def _jeton(erp: AccesErp, jeton_connexion: str) -> str:
    """Les refus de l'API gardent leur sens HTTP ; le reste est une indisponibilité, sans détail."""
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
    except Exception as panne:  # API injoignable ou catalogue refusé : indisponibilité, sans détail
        journal.warning("Catalogue MCP indisponible : %s", type(panne).__name__)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA indisponible.") from None
