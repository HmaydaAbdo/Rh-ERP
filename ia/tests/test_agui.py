"""Point d'entrée AG-UI avec le faux modèle de LangChain et Spring simulé : flux officiel, refus HTTP et pannes."""

import json
from collections.abc import Sequence
from typing import Any

import httpx
import pytest
from ag_ui.core import EventType
from doubles import INDICATEURS, ModeleScripte, appel, modele, outil
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langchain_core.tools import BaseTool, StructuredTool
from langgraph.checkpoint.base import BaseCheckpointSaver

from erp_rh_ia.agent import SYSTEME, creer_agent
from erp_rh_ia.agui import ERREUR_PUBLIQUE, FabriqueAgent
from erp_rh_ia.app import creer_app
from erp_rh_ia.config import Settings

QUESTION = "Masse salariale de 2026-09 ?"
REPONSE = "En 2026-09 : masse 1 250 000,50 MAD."


class AccesSimule:
    """Spring simulé : échange de jeton (ou refus HTTP), puis catalogue d'outils au nom du jeton agent."""

    def __init__(self, outils: Sequence[BaseTool], refus: int | None = None) -> None:
        self._outils = outils
        self._refus = refus
        self.jetons_connexion: list[str] = []
        self.jetons_agent: list[str] = []

    async def jeton_agent(self, jeton_connexion: str) -> str:
        if self._refus is not None:
            requete = httpx.Request("POST", "http://backend/auth/jetons/agent")
            raise httpx.HTTPStatusError("refus", request=requete, response=httpx.Response(self._refus, request=requete))
        self.jetons_connexion.append(jeton_connexion)
        return "jeton-agent"

    async def outils(self, jeton_agent: str) -> Sequence[BaseTool]:
        self.jetons_agent.append(jeton_agent)
        return self._outils


def _fabrique(faux: ModeleScripte) -> FabriqueAgent:
    def fabriquer(outils: Sequence[BaseTool], checkpointer: BaseCheckpointSaver[Any]) -> Any:
        return creer_agent(faux, outils, checkpointer=checkpointer)

    return fabriquer


def _settings(enabled: bool = True) -> Settings:
    return Settings(
        enabled=enabled,
        litellm_base_url="http://litellm:4000/v1",  # pyright: ignore[reportArgumentType]
        litellm_api_key="sk-test-cle",  # pyright: ignore[reportArgumentType]
        erp_api_url="http://backend:8080",  # pyright: ignore[reportArgumentType]
    )


def _corps(question: str | None = QUESTION, outils: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    messages = [] if question is None else [{"id": "m1", "role": "user", "content": question}]
    return {"threadId": "t1", "runId": "r1", "state": {}, "messages": messages, "tools": outils or [], "context": []}


def _lire(flux: str) -> list[dict[str, Any]]:
    return [json.loads(ligne[6:]) for ligne in flux.splitlines() if ligne.startswith("data: ")]


def _poster(
    faux: ModeleScripte, acces: AccesSimule, corps: dict[str, Any], enabled: bool = True, jeton: str | None = "c"
):
    entetes = {"Accept": "text/event-stream"} | ({"Authorization": f"Bearer {jeton}"} if jeton else {})
    with TestClient(creer_app(_settings(enabled), fabrique=_fabrique(faux), acces=acces)) as client:
        return client.post("/agui", json=corps, headers=entetes)


def _masse() -> ModeleScripte:
    raisonnement = {"reasoning_content": "L'utilisateur demande la masse de 2026-09 : je lis les indicateurs."}
    return modele(
        AIMessage(
            content="",
            additional_kwargs=raisonnement,
            tool_calls=[{"id": "a1", "name": "paie_indicateurs", "args": {"periode": "2026-09"}}],
        ),
        AIMessage(content=REPONSE),
    )


def test_un_run_complet_suit_le_contrat_ag_ui() -> None:
    acces = AccesSimule([outil("paie_indicateurs", INDICATEURS)])

    reponse = _poster(_masse(), acces, _corps())

    assert reponse.status_code == 200
    assert reponse.headers["content-type"].startswith("text/event-stream")
    assert reponse.headers["x-accel-buffering"] == "no"
    recus = _lire(reponse.text)
    types = [e["type"] for e in recus]
    assert types[0] == EventType.RUN_STARTED and types[-1] == EventType.RUN_FINISHED
    assert EventType.RUN_ERROR not in types
    # Raisonnement du modèle par les événements officiels, avant l'appel d'outil.
    assert "REASONING_MESSAGE_CONTENT" in types
    assert types.index("REASONING_MESSAGE_CONTENT") < types.index("TOOL_CALL_START")
    raisonnement = "".join(e["delta"] for e in recus if e["type"] == "REASONING_MESSAGE_CONTENT")
    assert "je lis les indicateurs" in raisonnement
    debut = next(e for e in recus if e["type"] == "TOOL_CALL_START")
    assert debut["toolCallName"] == "paie_indicateurs"
    # Réponse diffusée en texte, puis état partagé : vérifiée.
    texte = "".join(e["delta"] for e in recus if e["type"] == "TEXT_MESSAGE_CONTENT")
    assert texte == REPONSE
    etat = [e for e in recus if e["type"] == "STATE_SNAPSHOT"][-1]["snapshot"]
    assert etat["verification"] == "verifiee"
    # Rien d'interne : ni événement brut, ni consignes, ni état privé du vérificateur.
    assert "rawEvent" not in reponse.text and '"type":"RAW"' not in reponse.text
    assert SYSTEME[:40] not in reponse.text
    assert "chiffres_inconnus" not in reponse.text and "reecritures" not in reponse.text
    # Identité : le jeton de connexion est échangé, le catalogue est demandé avec le jeton agent.
    assert acces.jetons_connexion == ["c"] and acces.jetons_agent == ["jeton-agent"]


def test_un_message_simple_ne_declenche_aucun_outil() -> None:
    appels: list[str] = []
    faux = modele(AIMessage(content="Bonjour ! Que voulez-vous savoir ?"))

    recus = _lire(_poster(faux, AccesSimule([outil("paie_indicateurs", INDICATEURS, appels)]), _corps("Bonjour")).text)

    assert not any(e["type"].startswith("TOOL_CALL") for e in recus)
    assert "".join(e["delta"] for e in recus if e["type"] == "TEXT_MESSAGE_CONTENT").startswith("Bonjour !")
    assert appels == []


def test_un_outil_declare_par_le_navigateur_est_propose_au_modele() -> None:
    faux = modele(AIMessage(content="Bonjour."))
    ouvrir_vue = {"name": "ouvrir_vue", "description": "Propose une vue", "parameters": {"type": "object"}}

    _poster(faux, AccesSimule([outil("paie_indicateurs", INDICATEURS)]), _corps("Bonjour", [ouvrir_vue]))

    assert "ouvrir_vue" in faux.outils_lies[-1]


@pytest.mark.parametrize(
    ("enabled", "jeton", "refus", "attendu"),
    [
        (False, "c", None, 503),  # IA désactivée
        (True, None, None, 401),  # pas de jeton
        (True, "c", 401, 401),  # connexion expirée côté Spring
        (True, "c", 403, 403),  # droit IA_UTILISER absent
        (True, "c", 404, 503),  # IA non activée côté Spring
    ],
)
def test_les_refus_sont_des_erreurs_http_avant_tout_flux(
    enabled: bool, jeton: str | None, refus: int | None, attendu: int
) -> None:
    acces = AccesSimule([], refus=refus)

    reponse = _poster(_masse(), acces, _corps(), enabled=enabled, jeton=jeton)

    assert reponse.status_code == attendu
    assert not acces.jetons_agent  # aucun catalogue demandé


@pytest.mark.parametrize("question", [None, "   ", "x" * 2001])
def test_une_question_absente_vide_ou_trop_longue_est_refusee(question: str | None) -> None:
    assert _poster(_masse(), AccesSimule([]), _corps(question)).status_code == 422


def test_une_panne_devient_un_run_error_sans_detail() -> None:
    def panne(**_: Any) -> str:
        raise RuntimeError("détail interne : CIN AB123456")

    outil_en_panne = StructuredTool.from_function(
        func=panne, name="paie_indicateurs", description="Outil en panne", args_schema={"type": "object"}
    )
    reponse = _poster(_masse(), AccesSimule([outil_en_panne]), _corps())

    recus = _lire(reponse.text)
    assert recus[-1] == {"type": "RUN_ERROR", "message": ERREUR_PUBLIQUE, "code": "AGENT_INDISPONIBLE"}
    assert "AB123456" not in reponse.text


def test_un_appel_sans_question_preparee_reste_borne() -> None:
    """Le plafond officiel d'appels de modèle termine un run qui boucle sur les outils."""
    boucle = modele(*[appel("paie_indicateurs", identifiant=f"a{i}") for i in range(20)])

    recus = _lire(_poster(boucle, AccesSimule([outil("paie_indicateurs", INDICATEURS)]), _corps()).text)

    assert recus[-1]["type"] == EventType.RUN_FINISHED
    assert sum(e["type"] == "TOOL_CALL_START" for e in recus) <= 8
