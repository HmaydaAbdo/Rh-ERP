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
from fastapi.responses import Response, StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.runtime import RunControl
from langgraph.types import Durability

from staport_ia.documents import TEXTES, convertir_documents
from staport_ia.ecran import contexte_verifie
from staport_ia.memoire import espace_conversation, sujet
from staport_ia.outils import EchangeRefuse, contexte_erp, jeton_agent, outils_erp, titres_erp
from staport_ia.pieces_jointes import Analyseur, FichiersVerifies, verifier_pieces_jointes

journal = logging.getLogger(__name__)

MESSAGE_REDEMARRAGE = "Le service redémarre : votre conversation est conservée, renvoyez votre message dans un instant."
ERREUR_PUBLIQUE = "L'assistant est momentanément indisponible. Réessayez ou ouvrez l'écran classique."
MESSAGE_BLOQUE = (
    "Votre message n'a pas été traité : il contient une formulation que l'assistant refuse pour des raisons de "
    "sécurité. Reformulez votre demande ; la conversation reste utilisable."
)

TEXTE_QUESTION_REFUSEE = "[Message refusé pour des raisons de sécurité]"
MARQUE_REFUSEE = "refusee"

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

    def __init__(self, *args: Any, controle: RunControl, contexte_erp: str = "", **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._controle = controle
        self._contexte_erp = contexte_erp

    def get_stream_kwargs(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        base = super().get_stream_kwargs(*args, **kwargs)
        # Contexte d'exécution immuable (``context_schema`` de l'agent) : le service le fournit, jamais le navigateur.
        contexte = {**base.get("context", {}), "contexte_erp": self._contexte_erp}
        return {**base, "context": contexte, "control": self._controle, "durability": DURABILITE}


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

    async def contexte(self, jeton_agent: str) -> str: ...

    async def titres(self, jeton_agent: str) -> Sequence[tuple[str, str]]: ...

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
    """422 si le dernier message n'est pas une question de l'utilisateur, ou s'il est vide. Aucune longueur maximale
    (décision du propriétaire : aucun plafond appliqué par nous). La réponse à une question de l'agent
    (``poser_question``) et l'accord avant écriture sont des reprises d'interruption : elles n'apportent pas de
    nouvelle question et sont vérifiées par le fil propre à l'utilisateur, jamais par leur texte."""
    if est_reprise(entree):
        return
    dernier = entree.messages[-1] if entree.messages else None
    if not isinstance(dernier, UserMessage):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Le dernier message doit venir de l'utilisateur.")
    if isinstance(dernier.content, str):
        texte = dernier.content
    else:
        texte = " ".join(str(getattr(p, "text", "")) for p in dernier.content if getattr(p, "type", "") == "text")
    if not texte.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "La question est vide.")


def bloquee_par_le_garde_fou(message_erreur: str) -> bool:
    """Le refus du garde-fou de LiteLLM (``litellm_config.yaml``, mots-clés ``BLOCK``) : l'intégration AG-UI rend le
    texte de l'exception dans son événement ``RUN_ERROR``, et LiteLLM commence ce refus par « Content blocked »."""
    return "Content blocked" in message_erreur


async def neutraliser_la_question_bloquee(
    graphe: CompiledStateGraph[Any, Any, Any, Any], entree: RunAgentInput
) -> None:
    """Garde dans le fil la question refusée sous un texte neutre, marqué ``refusee``, sous le même identifiant.

    Ni ``RemoveMessage`` ni un simple remplacement ne suffisent : le navigateur renvoie tout l'historique à chaque
    tour, et l'intégration AG-UI (``ag_ui_langgraph``) rajoute au fil un message dont l'identifiant a disparu ou, si
    son texte diffère de celui du fil, y voit une modification et rétablit le texte d'origine. Dans les deux cas la
    question refusée revenait et chaque message suivant de la conversation était refusé à son tour
    (``sans_questions_refusees`` la retire de l'entrée)."""
    identifiants = [m.id for m in entree.messages if isinstance(m, UserMessage)]
    if identifiants:
        await graphe.aupdate_state(
            {"configurable": {"thread_id": entree.thread_id}},
            {
                "messages": [
                    HumanMessage(
                        id=identifiants[-1], content=TEXTE_QUESTION_REFUSEE, additional_kwargs={MARQUE_REFUSEE: True}
                    )
                ]
            },
        )


async def sans_questions_refusees(
    graphe: CompiledStateGraph[Any, Any, Any, Any], entree: RunAgentInput
) -> RunAgentInput:
    """Retire de l'entrée les questions déjà refusées dans ce fil : le fil les garde sous leur texte neutre."""
    etat = await graphe.aget_state({"configurable": {"thread_id": entree.thread_id}})
    refusees = {
        m.id for m in etat.values.get("messages", []) if m.additional_kwargs.get(MARQUE_REFUSEE) and m.id is not None
    }
    if not refusees:
        return entree
    return entree.model_copy(update={"messages": [m for m in entree.messages if m.id not in refusees]})


async def evenements(
    entree: RunAgentInput,
    fabrique: FabriqueAgent,
    outils: Sequence[BaseTool],
    memoire: BaseCheckpointSaver[Any] | None = None,
    thread_id: str | None = None,
    utilisateur: str = "anonyme",
    contexte_erp: str = "",
) -> AsyncGenerator[BaseEvent]:
    """Le run en événements AG-UI ; toute panne devient un ``RUN_ERROR`` générique, sans détail.

    ``entree`` porte le fil propre à l'utilisateur ; les événements rendent au navigateur l'identifiant qu'il a
    envoyé (``thread_id``)."""
    demarre = False
    graphe: CompiledStateGraph[Any, Any, Any, Any] | None = None
    bloquee = False
    controle = RunControl()
    ARRETS_EN_COURS.add(controle)
    try:
        # Mémoire durable (memoire.py) ou celle du run.
        graphe = fabrique(outils, memoire or InMemorySaver(), utilisateur)
        officiel = AgentAGUI(
            controle=controle,
            contexte_erp=contexte_erp,
            name="staport-intelligence",
            graph=graphe,
            # Aucun plafond appliqué par nous (décision du propriétaire, KAN-40) : seule cette limite de récursion de
            # LangGraph, propre au framework, arrête un run qui boucle ; une durée anormale se détecte par les alertes.
            config={"recursion_limit": 200},
        )
        async for brut in officiel.run(await sans_questions_refusees(graphe, entree)):
            evenement = cast(BaseEvent, brut)
            if evenement.type == EventType.RUN_ERROR:
                bloquee = bloquee_par_le_garde_fou(getattr(evenement, "message", "") or "")
                raise RuntimeError("RUN_ERROR")
            if evenement.type == EventType.RAW:
                continue
            demarre = demarre or evenement.type == EventType.RUN_STARTED
            if thread_id is not None and hasattr(evenement, "thread_id"):
                evenement = evenement.model_copy(update={"thread_id": thread_id})
            yield evenement.model_copy(update={"raw_event": None}) if evenement.raw_event is not None else evenement
    except Exception as panne:  # le détail reste côté serveur, sans contenu RH
        arret = controle.drain_requested
        bloquee = bloquee and not arret
        if bloquee and graphe is not None:
            try:
                await neutraliser_la_question_bloquee(graphe, entree)
            except Exception as echec:  # la réponse d'erreur part quand même : seul le fil garde alors la question
                journal.warning("Question refusée non retirée du fil %s : %s", entree.run_id, type(echec).__name__)
        if arret:
            journal.info("Run %s arrêté proprement (%s), reprise possible", entree.run_id, controle.drain_reason)
        else:
            journal.warning("Run %s en échec : %s", entree.run_id, type(panne).__name__)
        if not demarre:
            yield RunStartedEvent(thread_id=entree.thread_id, run_id=entree.run_id)
        yield RunErrorEvent(
            message=MESSAGE_REDEMARRAGE if arret else MESSAGE_BLOQUE if bloquee else ERREUR_PUBLIQUE,
            code="SERVICE_REDEMARRE" if arret else "DEMANDE_BLOQUEE" if bloquee else "AGENT_INDISPONIBLE",
        )
    finally:
        ARRETS_EN_COURS.discard(controle)


class AccesHttp:
    """``AccesErp`` réel : échange RFC 8693 (``/oauth/token``) puis ``/mcp`` de l'API ERP."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        api: str,
        complement: Callable[[], Awaitable[Sequence[BaseTool]]] | None = None,
    ) -> None:
        self._client = client
        self._api = api.rstrip("/")
        #: Outils qui ne viennent pas de l'API ERP (serveurs de documents, ``bureautique.py``) : ajoutés au catalogue
        #: de l'utilisateur ; ils n'ouvrent aucun accès aux données de l'ERP.
        self._complement = complement

    async def jeton_agent(self, jeton_connexion: str) -> str:
        return await jeton_agent(self._api, jeton_connexion)

    async def outils(self, jeton_agent: str) -> Sequence[BaseTool]:
        outils = await outils_erp(f"{self._api}/mcp", jeton_agent)
        return [*outils, *await self._complement()] if self._complement else outils

    async def contexte(self, jeton_agent: str) -> str:
        return await contexte_erp(f"{self._api}/mcp", jeton_agent)

    async def titres(self, jeton_agent: str) -> Sequence[tuple[str, str]]:
        return await titres_erp(f"{self._api}/mcp", jeton_agent)

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
    pieces_jointes: Callable[[], bool] = lambda: False,
    analyseur: Callable[[], Analyseur | None] = lambda: None,
) -> APIRouter:
    routeur = APIRouter()
    verifies = FichiersVerifies()

    @routeur.post("/agui")
    async def executer(entree: RunAgentInput, requete: Request) -> StreamingResponse:  # pyright: ignore[reportUnusedFunction]
        if not actif():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA désactivé.")
        autorisation = requete.headers.get("authorization", "")
        if not autorisation.lower().startswith("bearer ") or not autorisation[7:].strip():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
        verifier_question(entree)

        await verifier_pieces_jointes(entree.messages, pieces_jointes(), analyseur(), verifies)
        try:
            # Vérifie que chaque document se lit et remplit le cache ; le modèle lira le texte (LectureDocuments),
            # le fil garde le fichier d'origine pour l'affichage.
            await convertir_documents(entree.messages, TEXTES)
        except Exception as erreur:  # format illisible malgré une signature correcte
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Ce document n'a pas pu être lu.") from erreur
        erp = acces()
        jeton = await _jeton(erp, autorisation[7:].strip())
        outils = await _outils(erp, jeton)
        texte_contexte = await _contexte(erp, jeton)
        encodeur = EventEncoder(accept=requete.headers.get("accept") or "text/event-stream")
        # L'état envoyé par le navigateur n'est pas une source de confiance ; les outils qu'il déclare (rendu A2UI du
        # runtime CopilotKit) sont exécutés côté client, jamais par le serveur.
        # Le fil est celui de cet utilisateur : l'identifiant de conversation du navigateur n'est jamais pris tel quel.
        fil = espace_conversation(sujet(jeton), entree.thread_id)
        # Les compétences épinglées sont choisies ici, hors modèle, jamais prises de l'état envoyé par le navigateur.
        # Une reprise garde l'état du fil (compétences déjà épinglées) : le navigateur n'y apporte rien.
        # Le contexte d'écran du navigateur est un indice : le serveur le revérifie et le réécrit (ecran.py, KAN-83).
        contexte_ecran = contexte_verifie(entree.context)
        if est_reprise(entree):
            entree_serveur = entree.model_copy(update={"state": {}, "thread_id": fil, "context": contexte_ecran})
        else:
            epinglees = await routage()(texte_question(entree), outils) if routage else []
            entree_serveur = entree.model_copy(
                update={
                    "state": {"pinned_skills": epinglees},
                    "thread_id": fil,
                    "context": contexte_ecran,
                }
            )

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
                    texte_contexte,
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

    @routeur.delete("/conversations/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def supprimer(thread_id: str, requete: Request) -> Response:  # pyright: ignore[reportUnusedFunction]
        """Efface la mémoire de la conversation de l'utilisateur connecté (KAN-81) : jamais celle d'un autre, puisque
        le fil est préfixé par l'identité portée par son jeton ; appelée par le runtime avant de retirer la ligne."""
        if not actif():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA désactivé.")
        autorisation = requete.headers.get("authorization", "")
        if not autorisation.lower().startswith("bearer ") or not autorisation[7:].strip():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
        jeton = await _jeton(acces(), autorisation[7:].strip())
        saver = memoire() if memoire else None
        if saver is not None:
            await saver.adelete_thread(espace_conversation(sujet(jeton), thread_id))
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return routeur


async def _jeton(erp: AccesErp, jeton_connexion: str) -> str:
    """Les refus de l'API gardent leur sens HTTP ; le reste est une indisponibilité, sans détail."""
    try:
        return await erp.jeton_agent(jeton_connexion)
    except EchangeRefuse as refus:
        if refus.erreur == "invalid_grant":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion expirée.") from None
        if refus.erreur == "access_denied":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Droit IA_UTILISER requis.") from None
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA indisponible.") from None
    except httpx.HTTPError, ValueError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA indisponible.") from None


async def _outils(erp: AccesErp, jeton: str) -> Sequence[BaseTool]:
    try:
        return await erp.outils(jeton)
    except Exception as panne:  # API injoignable ou catalogue refusé : indisponibilité, sans détail
        journal.warning("Catalogue MCP indisponible : %s", type(panne).__name__)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA indisponible.") from None


async def _contexte(erp: AccesErp, jeton: str) -> str:
    """Le contexte du moment (ressource MCP) ; une panne laisse l'instruction du modèle plus courte."""
    try:
        return await erp.contexte(jeton)
    except Exception as panne:  # jamais un échec de la question
        journal.warning("Contexte MCP indisponible : %s", type(panne).__name__)
        return ""
