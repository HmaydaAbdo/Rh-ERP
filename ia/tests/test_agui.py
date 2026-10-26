"""Point d'entrée AG-UI avec un modèle et Spring simulés : ordre des événements, refus HTTP, pannes et annulation."""

import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import httpx
import pytest
from ag_ui.core import EventType, RunAgentInput, UserMessage
from doubles import ModeleScripte, OutilsSimules, appel, ok
from fastapi.testclient import TestClient

from erp_rh_ia.agent import EVENEMENT_MASCOTTE, EVENEMENT_REPONSE, SYSTEME, Agent
from erp_rh_ia.agui import ERREUR_PUBLIQUE, evenements
from erp_rh_ia.app import creer_app
from erp_rh_ia.config import Settings
from erp_rh_ia.modele import Brouillon
from erp_rh_ia.outils import Outils

INDICATEURS = {
    "periode": "2026-09",
    "indicateurs": {"masse": 1250000.5, "effectif": 412},
    "vue": {"module": "paie", "vue": "analytique", "parametres": {"periode": "2026-09"}},
}
QUESTION = "Masse salariale de 2026-09 ?"


class AccesSimule:
    """Spring simulé : échange de jeton (ou refus HTTP) et session MCP dont on observe l'ouverture et la fermeture."""

    def __init__(self, outils: Outils, refus: int | None = None) -> None:
        self._outils = outils
        self._refus = refus
        self.jetons_connexion: list[str] = []
        self.jetons_agent: list[str] = []
        self.fermee = False

    async def jeton_agent(self, jeton_connexion: str) -> str:
        if self._refus is not None:
            requete = httpx.Request("POST", "http://backend/auth/jetons/agent")
            raise httpx.HTTPStatusError("refus", request=requete, response=httpx.Response(self._refus, request=requete))
        self.jetons_connexion.append(jeton_connexion)
        return "jeton-agent"

    @asynccontextmanager
    async def outils(self, jeton_agent: str) -> AsyncGenerator[Outils]:
        self.jetons_agent.append(jeton_agent)
        try:
            yield self._outils
        finally:
            self.fermee = True


def _settings(enabled: bool = True) -> Settings:
    return Settings(
        enabled=enabled,
        litellm_base_url="http://litellm:4000/v1",  # pyright: ignore[reportArgumentType]
        litellm_api_key="sk-test-cle",  # pyright: ignore[reportArgumentType]
        erp_api_url="http://backend:8080",  # pyright: ignore[reportArgumentType]
    )


def _corps(question: str | None = QUESTION) -> dict[str, Any]:
    messages = [] if question is None else [{"id": "m1", "role": "user", "content": question}]
    return {"threadId": "t1", "runId": "r1", "state": {}, "messages": messages, "tools": [], "context": []}


def _agent_masse() -> Agent:
    return Agent(
        ModeleScripte(
            [appel("paie_indicateurs", periode="2026-09")],
            [Brouillon("En 2026-09 : masse 1 250 000,50 MAD.", 0, False)],
            domaines=["paie"],
        )
    )


def _lire(flux: str) -> list[dict[str, Any]]:
    return [json.loads(ligne[6:]) for ligne in flux.splitlines() if ligne.startswith("data: ")]


def _poster(
    agent: Agent, acces: AccesSimule, corps: dict[str, Any], enabled: bool = True, jeton: str | None = "connexion"
):
    entetes = {"Accept": "text/event-stream"} | ({"Authorization": f"Bearer {jeton}"} if jeton else {})
    with TestClient(creer_app(_settings(enabled), agent=agent, acces=acces)) as client:
        return client.post("/agui", json=corps, headers=entetes)


def test_une_salutation_repond_sans_etape_de_recherche() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})

    reponse = _poster(Agent(ModeleScripte([], [])), AccesSimule(outils), _corps("Bonjour"))

    evenements_recus = _lire(reponse.text)
    etapes = [e["stepName"] for e in evenements_recus if e["type"] == "STEP_STARTED"]
    assert etapes == ["trier", "conclure"]
    assert not any(e["type"].startswith("TOOL_CALL") for e in evenements_recus)
    texte = "".join(e.get("delta", "") for e in evenements_recus if e["type"] == "TEXT_MESSAGE_CONTENT")
    assert texte.startswith("Bonjour !")
    assert outils.appels == []


def test_un_run_complet_suit_le_contrat_ag_ui() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    acces = AccesSimule(outils)

    reponse = _poster(_agent_masse(), acces, _corps())

    assert reponse.status_code == 200
    assert reponse.headers["content-type"].startswith("text/event-stream")
    assert reponse.headers["x-accel-buffering"] == "no"
    evenements_recus = _lire(reponse.text)
    types = [e["type"] for e in evenements_recus]
    assert types[0] == EventType.RUN_STARTED and types[-1] == EventType.RUN_FINISHED
    assert EventType.RUN_ERROR not in types
    # Outil annoncé, arguments, fin, dans cet ordre ; son résultat arrive dans l'instantané des messages.
    outil = [t for t in types if t.startswith("TOOL_CALL")]
    assert outil == ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END"]
    debut = next(e for e in evenements_recus if e["type"] == "TOOL_CALL_START")
    assert debut["toolCallName"] == "paie_indicateurs"
    # Étapes : un nœud du graphe à la fois, de « trier » à « conclure », chacune ouverte puis fermée.
    etapes = [(e["type"], e["stepName"]) for e in evenements_recus if e["type"].startswith("STEP_")]
    assert etapes[0] == ("STEP_STARTED", "trier")
    assert ("STEP_STARTED", "preparer") in etapes
    assert etapes[-1] == ("STEP_FINISHED", "conclure")
    assert sum(t == "STEP_STARTED" for t, _ in etapes) == sum(t == "STEP_FINISHED" for t, _ in etapes)
    assert ("STEP_STARTED", "verifier") in etapes
    assert types.index("TEXT_MESSAGE_START") > max(
        i for i, e in enumerate(evenements_recus) if e.get("stepName") == "verifier"
    )
    # Conversation visible : question, appel, synthèse du résultat, réponse — jamais l'état interne.
    instantane = [e for e in evenements_recus if e["type"] == "MESSAGES_SNAPSHOT"][-1]["messages"]
    assert [m["role"] for m in instantane] == ["user", "assistant", "tool", "assistant"]
    assert instantane[2]["content"] == "ok"
    assert instantane[-1]["content"] == "En 2026-09 : masse 1 250 000,50 MAD."
    assert "rawEvent" not in reponse.text and '"type":"RAW"' not in reponse.text
    assert SYSTEME[:40] not in reponse.text and "echanges" not in reponse.text and "manually_emit" not in reponse.text
    # Texte vérifié en un seul message, puis méta-données de la réponse avec la vue Spring.
    texte = "".join(e["delta"] for e in evenements_recus if e["type"] == "TEXT_MESSAGE_CONTENT")
    assert texte == "En 2026-09 : masse 1 250 000,50 MAD."
    meta = next(e for e in evenements_recus if e.get("name") == EVENEMENT_REPONSE)
    assert meta["value"] == {"abstention": False, "motif": None, "vue": INDICATEURS["vue"]}
    # Mascotte : séquence strictement croissante, corrélée au run.
    mascotte = [e for e in evenements_recus if e.get("name") == EVENEMENT_MASCOTTE]
    sequences = [e["value"]["sequence"] for e in mascotte]
    assert sequences == sorted(set(sequences))
    assert [e["value"]["mood"] for e in mascotte] == ["thinking", "searching", "found", "neutral"]
    assert mascotte[0]["metadata"] == {"com_staport": {"threadId": "t1", "runId": "r1"}}
    # Identité : le jeton de connexion est échangé, la session MCP part avec le jeton agent et se ferme.
    assert acces.jetons_connexion == ["connexion"]
    assert acces.jetons_agent == ["jeton-agent"]
    assert acces.fermee


def test_une_abstention_reste_un_run_termine() -> None:
    outils = OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)})
    agent = Agent(ModeleScripte([], [Brouillon("Je n'ai pas cette donnée.", None, True)], domaines=[]))

    evenements_recus = _lire(_poster(agent, AccesSimule(outils), _corps("Quel temps fera-t-il ?")).text)

    meta = next(e for e in evenements_recus if e.get("name") == EVENEMENT_REPONSE)
    assert meta["value"]["abstention"] is True
    assert meta["value"]["motif"] == "SANS_DONNEES"
    assert evenements_recus[-1]["type"] == EventType.RUN_FINISHED


@pytest.mark.parametrize(
    ("enabled", "jeton", "refus", "attendu"),
    [
        (False, "connexion", None, 503),  # IA désactivée
        (True, None, None, 401),  # pas de jeton
        (True, "connexion", 401, 401),  # connexion expirée côté Spring
        (True, "connexion", 403, 403),  # droit IA_UTILISER absent
        (True, "connexion", 404, 503),  # IA non activée côté Spring
    ],
)
def test_les_refus_sont_des_erreurs_http_avant_tout_flux(
    enabled: bool, jeton: str | None, refus: int | None, attendu: int
) -> None:
    acces = AccesSimule(OutilsSimules({}), refus=refus)

    reponse = _poster(_agent_masse(), acces, _corps(), enabled=enabled, jeton=jeton)

    assert reponse.status_code == attendu
    assert not acces.jetons_agent  # aucune session MCP ouverte


@pytest.mark.parametrize("question", [None, "   ", "x" * 2001])
def test_une_question_absente_vide_ou_trop_longue_est_refusee(question: str | None) -> None:
    reponse = _poster(_agent_masse(), AccesSimule(OutilsSimules({})), _corps(question))

    assert reponse.status_code == 422


class OutilsEnPanne(OutilsSimules):
    async def appeler(self, nom: str, arguments: dict[str, Any]) -> Any:
        raise RuntimeError("détail interne : CIN AB123456")


def test_une_panne_devient_un_run_error_sans_detail() -> None:
    acces = AccesSimule(OutilsEnPanne({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)}))

    reponse = _poster(_agent_masse(), acces, _corps())

    evenements_recus = _lire(reponse.text)
    assert evenements_recus[-1] == {"type": "RUN_ERROR", "message": ERREUR_PUBLIQUE, "code": "AGENT_INDISPONIBLE"}
    assert "AB123456" not in reponse.text
    assert acces.fermee


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_un_client_qui_part_ferme_la_session_mcp() -> None:
    """Déconnexion du navigateur : Starlette arrête le générateur, la session MCP du run est fermée."""
    acces = AccesSimule(OutilsSimules({"paie_indicateurs": ok("paie_indicateurs", INDICATEURS)}))
    entree = RunAgentInput(
        thread_id="t1", run_id="r1", messages=[UserMessage(id="m1", content=QUESTION)], state={}, tools=[], context=[]
    )
    flux = evenements(entree, _agent_masse(), acces.outils("jeton-agent"))

    recus: list[str] = []
    async for evenement in flux:
        recus.append(evenement.type)
        if evenement.type == EventType.TOOL_CALL_START:
            break
    assert not acces.fermee  # run en cours, outil pas encore exécuté
    await flux.aclose()

    assert acces.fermee
    assert EventType.TEXT_MESSAGE_START not in recus
