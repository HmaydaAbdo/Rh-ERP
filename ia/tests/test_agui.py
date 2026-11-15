"""Point d'entrée AG-UI avec le faux modèle de LangChain et API simulée : flux officiel, refus HTTP et pannes."""

import json
from collections.abc import Sequence
from typing import Any, cast

import httpx
import pytest
from ag_ui.core import EventType
from doubles import INDICATEURS, ModeleScripte, appel, memoire_processus, modele, outil, store_avec_competences
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from langchain_core.tools import BaseTool, StructuredTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.store.memory import InMemoryStore

from staport_ia.agent import SYSTEME, creer_agent
from staport_ia.agui import FabriqueAgent, demander_arret
from staport_ia.app import creer_app
from staport_ia.config import Settings
from staport_ia.fichiers import FICHIERS_MAX, TAILLE_MAX_FICHIER
from staport_ia.memoire import sujet

QUESTION = "Masse salariale de 2026-09 ?"
REPONSE = "En 2026-09 : masse 1 250 000,50 MAD."


class AccesSimule:
    """API simulée : échange de jeton (ou refus HTTP), puis catalogue d'outils au nom du jeton agent."""

    def __init__(self, outils: Sequence[BaseTool], refus: int | None = None) -> None:
        self._outils = outils
        self._refus = refus
        self.jetons_connexion: list[str] = []
        self.jetons_agent: list[str] = []
        self.ecritures: list[tuple[str, str, int, str]] = []

    async def signaler_ecriture(self, jeton_agent: str, chemin: str, taille: int, outil: str) -> None:
        self.ecritures.append((jeton_agent, chemin, taille, outil))

    async def jeton_agent(self, jeton_connexion: str) -> str:
        if self._refus is not None:
            requete = httpx.Request("POST", "http://backend/auth/jetons/agent")
            raise httpx.HTTPStatusError("refus", request=requete, response=httpx.Response(self._refus, request=requete))
        self.jetons_connexion.append(jeton_connexion)
        return "jeton-agent"

    async def outils(self, jeton_agent: str) -> Sequence[BaseTool]:
        self.jetons_agent.append(jeton_agent)
        return self._outils

    async def contexte(self, jeton_agent: str) -> str:
        return "Date du jour : 2026-11-15."


async def _routage_paie(_question: str, _outils: Sequence[BaseTool]) -> list[str]:
    """Le routeur réel charge un modèle d'embeddings : les tests de l'API le remplacent par un choix fixe."""
    return ["paie"]


def _fabrique(faux: ModeleScripte) -> FabriqueAgent:
    def fabriquer(outils: Sequence[BaseTool], checkpointer: BaseCheckpointSaver[Any] | None, utilisateur: str) -> Any:
        return creer_agent(faux, outils, checkpointer=checkpointer, utilisateur=utilisateur)

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
    with TestClient(
        creer_app(
            _settings(enabled), fabrique=_fabrique(faux), acces=acces, routage=_routage_paie, memoire=memoire_processus
        )
    ) as client:
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
    # Réponse diffusée en texte, puis état partagé.
    texte = "".join(e["delta"] for e in recus if e["type"] == "TEXT_MESSAGE_CONTENT")
    assert texte == REPONSE
    # Rien d'interne : ni événement brut, ni consignes.
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
        (True, "c", 401, 401),  # connexion expirée côté API
        (True, "c", 403, 403),  # droit IA_UTILISER absent
        (True, "c", 404, 503),  # IA non activée côté API
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


def test_un_message_d_outil_n_est_plus_une_question_valide() -> None:
    """KAN-264 : la réponse à l'agent passe par la reprise d'interruption ; un résultat d'outil envoyé par le navigateur
    n'est pas accepté comme dernier message."""
    corps = _corps()
    corps["messages"] = [
        {"id": "m1", "role": "user", "content": QUESTION},
        {"id": "t1", "role": "tool", "toolCallId": "c1", "content": "Par masse salariale"},
    ]

    assert _poster(modele(AIMessage(content=REPONSE)), AccesSimule([]), corps).status_code == 422


def test_la_question_de_l_agent_s_interrompt_dans_le_flux_puis_reprend_avec_la_reponse() -> None:
    """KAN-264 de bout en bout par /agui : ``poser_question`` interrompt, la réponse arrive par la reprise."""
    faux = modele(
        appel(
            "poser_question",
            question="Quel classement ?",
            options=[{"label": "Masse salariale"}, {"label": "Effectif"}],
        ),
        AIMessage(content="Classement par masse salariale."),
    )
    entetes = {"Accept": "text/event-stream", "Authorization": "Bearer c"}
    with _app_ecrivain(faux, store_avec_competences(), AccesSimule([])) as client:
        pause = _lire(client.post("/agui", json=_corps("Classe les services"), headers=entetes).text)
        interruptions = [e for e in pause if e["type"] == "CUSTOM" and e["name"] == "on_interrupt"]
        assert interruptions, [e["type"] for e in pause]
        valeur = json.loads(interruptions[0]["value"])
        assert valeur["type"] == "question"
        assert [o["label"] for o in valeur["options"]] == ["Masse salariale", "Effectif"]

        reprise = _corps("Classe les services")
        reprise["forwardedProps"] = {"command": {"resume": "Masse salariale"}}
        fin = _lire(client.post("/agui", json=reprise, headers=entetes).text)

    assert fin[-1]["type"] == EventType.RUN_FINISHED and EventType.RUN_ERROR not in [e["type"] for e in fin]
    messages = next(e for e in reversed(fin) if e["type"] == "MESSAGES_SNAPSHOT")["messages"]
    assert next(m for m in messages if m["role"] == "tool")["content"] == "Masse salariale"
    assert "".join(e["delta"] for e in fin if e["type"] == "TEXT_MESSAGE_CONTENT") == "Classement par masse salariale."


def test_une_panne_d_outil_est_expliquee_par_le_modele_sans_detail_interne() -> None:
    def panne(**_: Any) -> str:
        raise RuntimeError("détail interne : CIN AB123456")

    outil_en_panne = StructuredTool.from_function(
        func=panne, name="paie_indicateurs", description="Outil en panne", args_schema={"type": "object"}
    )
    reponse = _poster(_masse(), AccesSimule([outil_en_panne]), _corps())

    recus = _lire(reponse.text)
    # `ToolErrorMiddleware` : le run continue, le modèle voit le type de l'erreur et jamais son message brut.
    assert recus[-1]["type"] == EventType.RUN_FINISHED
    assert "RuntimeError" in reponse.text
    assert "AB123456" not in reponse.text


def test_un_run_n_est_pas_tronque_par_un_plafond_d_appels() -> None:
    """KAN-40, décision du propriétaire : aucun plafond appliqué par nous. Douze appels d'outils d'affilée (au-delà de
    l'ancien plafond de 8) aboutissent à la réponse ; seule la limite de récursion de LangGraph borne un run."""
    suite = [appel("paie_indicateurs", identifiant=f"a{i}") for i in range(12)]
    boucle = modele(*suite, AIMessage(content=REPONSE))

    recus = _lire(_poster(boucle, AccesSimule([outil("paie_indicateurs", INDICATEURS)]), _corps()).text)

    assert recus[-1]["type"] == EventType.RUN_FINISHED and EventType.RUN_ERROR not in [e["type"] for e in recus]
    assert sum(e["type"] == "TOOL_CALL_START" for e in recus) == 12
    assert "".join(e["delta"] for e in recus if e["type"] == "TEXT_MESSAGE_CONTENT") == REPONSE


def _app_ecrivain(faux: ModeleScripte, store: InMemoryStore, acces: AccesSimule) -> TestClient:
    def fabriquer(outils: Sequence[BaseTool], checkpointer: BaseCheckpointSaver[Any] | None, utilisateur: str) -> Any:
        return creer_agent(faux, outils, checkpointer=checkpointer, utilisateur=utilisateur, store=store)

    return TestClient(
        creer_app(_settings(), fabrique=fabriquer, acces=acces, routage=_routage_paie, memoire=memoire_processus)
    )


def test_une_ecriture_dans_l_espace_s_interrompt_dans_le_flux_puis_reprend_apres_l_accord() -> None:
    """KAN-260 / KAN-267 de bout en bout par le point d'entrée AG-UI : pause, rien d'écrit, reprise après accord."""
    store = store_avec_competences()
    utilisateur = sujet("jeton-agent")  # le jeton agent simulé n'est pas un JWT : l'identité est son empreinte
    faux = modele(
        appel("write_file", file_path="/espace/rapport.md", content="Masse : 1 250 000,50 MAD."),
        AIMessage(content="Rapport enregistré."),
    )
    acces = AccesSimule([outil("paie_indicateurs", INDICATEURS)])
    entetes = {"Accept": "text/event-stream", "Authorization": "Bearer c"}
    with _app_ecrivain(faux, store, acces) as client:
        pause = _lire(client.post("/agui", json=_corps("Écris le rapport"), headers=entetes).text)

        interruptions = [e for e in pause if e["type"] == "CUSTOM" and e["name"] == "on_interrupt"]
        assert interruptions, [e["type"] for e in pause]
        assert pause[-1]["type"] == EventType.RUN_FINISHED
        assert store.get((utilisateur, "espace"), "/rapport.md") is None

        reprise = _corps("Écris le rapport")
        reprise["forwardedProps"] = {"command": {"resume": {"decisions": [{"type": "approve"}]}}}
        fin = _lire(client.post("/agui", json=reprise, headers=entetes).text)

    assert fin[-1]["type"] == EventType.RUN_FINISHED and EventType.RUN_ERROR not in [e["type"] for e in fin]
    assert "".join(e["delta"] for e in fin if e["type"] == "TEXT_MESSAGE_CONTENT") == "Rapport enregistré."
    ecrits = [i for i in store.search((utilisateur, "espace"))]
    assert len(ecrits) == 1 and ecrits[0].key == "/rapport.md"
    # KAN-268 : une seule écriture journalisée, après l'accord, avec chemin, taille et outil, jamais le contenu.
    assert acces.ecritures == [("jeton-agent", "/espace/rapport.md", len("Masse : 1 250 000,50 MAD."), "write_file")]


def test_les_fichiers_de_l_espace_se_listent_et_se_telechargent_pour_leur_seul_proprietaire() -> None:
    """KAN-267 : l'identité vient de l'échange de jeton ; un autre utilisateur ne voit rien."""
    proprietaire = sujet("jeton-agent")
    entetes = {"Authorization": "Bearer c"}
    with _app_ecrivain(modele(AIMessage(content="x")), store_avec_competences(), AccesSimule([])) as client:
        store = cast(InMemoryStore, client.app.state.store)  # type: ignore[attr-defined]
        store.put((proprietaire, "espace"), "/rapport.md", {"content": "Masse : 1 250 000,50 MAD."})
        store.put(("autre", "espace"), "/secret.md", {"content": "à un autre"})
        liste = client.get("/fichiers", headers=entetes).json()
        fichier = client.get("/fichiers/espace/rapport.md", headers=entetes)
        autre = client.get("/fichiers/espace/secret.md", headers=entetes)
        piege = client.get("/fichiers/espace/../secret.md", headers=entetes)
        sans_jeton = client.get("/fichiers/espace/rapport.md")

    assert [f["chemin"] for f in liste] == ["/espace/rapport.md"]
    assert fichier.status_code == 200 and fichier.text == "Masse : 1 250 000,50 MAD."
    assert fichier.headers["content-disposition"] == 'attachment; filename="rapport.md"'
    assert fichier.headers["x-content-type-options"] == "nosniff"
    assert autre.status_code == 404 and piege.status_code == 404
    assert sans_jeton.status_code == 401


def _ecrire_apres_accord(chemin: str, contenu: str, remplir: int = 0) -> str:
    """Joue une écriture jusqu'à l'accord de l'utilisateur ; rend le résultat de l'outil vu par le modèle."""
    store = store_avec_competences()
    proprietaire = sujet("jeton-agent")
    for i in range(remplir):
        store.put((proprietaire, "espace"), f"/f{i}.md", {"content": "x"})
    faux = modele(appel("write_file", file_path=chemin, content=contenu), AIMessage(content="Terminé."))
    entetes = {"Accept": "text/event-stream", "Authorization": "Bearer c"}
    with _app_ecrivain(faux, store, AccesSimule([outil("paie_indicateurs", INDICATEURS)])) as client:
        client.post("/agui", json=_corps("Écris"), headers=entetes)
        reprise = _corps("Écris")
        reprise["forwardedProps"] = {"command": {"resume": {"decisions": [{"type": "approve"}]}}}
        flux = _lire(client.post("/agui", json=reprise, headers=entetes).text)
    # Le résultat de l'outil d'un run repris n'est pas diffusé seul : il figure dans l'instantané final des messages.
    messages = next(e for e in reversed(flux) if e["type"] == "MESSAGES_SNAPSHOT")["messages"]
    return next(m for m in messages if m["role"] == "tool")["content"]


def test_une_ecriture_trop_grosse_est_refusee_avec_son_motif() -> None:
    assert "trop gros" in _ecrire_apres_accord("/espace/gros.md", "y" * (TAILLE_MAX_FICHIER + 1))


def test_une_ecriture_au_dela_du_quota_de_fichiers_est_refusee_avec_son_motif() -> None:
    assert "Espace plein" in _ecrire_apres_accord("/espace/nouveau.md", "x", remplir=FICHIERS_MAX)


def test_remplacer_un_fichier_existant_reste_permis_quand_l_espace_est_plein() -> None:
    assert "plein" not in _ecrire_apres_accord("/espace/f0.md", "nouveau contenu", remplir=FICHIERS_MAX)


def test_un_arret_du_service_termine_l_etape_puis_la_conversation_reprend() -> None:
    """KAN-39 : à SIGTERM, le run termine son étape (l'outil), s'arrête proprement avec un message dédié, et la même
    conversation reprend ensuite jusqu'à sa réponse (doc LangGraph, « Graceful shutdown »)."""

    def indicateurs_pendant_l_arret(**_: Any) -> dict[str, Any]:
        assert demander_arret("sigterm") == 1  # le signal arrive pendant l'exécution de l'outil
        return INDICATEURS

    faux = modele(
        appel("paie_indicateurs"),
        AIMessage(content=REPONSE),
    )
    acces = AccesSimule([outil("paie_indicateurs", indicateurs_pendant_l_arret)])
    entetes = {"Accept": "text/event-stream", "Authorization": "Bearer c"}
    with TestClient(
        creer_app(_settings(), fabrique=_fabrique(faux), acces=acces, routage=_routage_paie, memoire=memoire_processus)
    ) as client:
        arret = _lire(client.post("/agui", json=_corps(), headers=entetes).text)
        reprise = _lire(client.post("/agui", json=_corps(), headers=entetes).text)

    erreur = next(e for e in arret if e["type"] == EventType.RUN_ERROR)
    assert erreur["code"] == "SERVICE_REDEMARRE" and "AB123456" not in json.dumps(arret)
    assert reprise[-1]["type"] == EventType.RUN_FINISHED and EventType.RUN_ERROR not in [e["type"] for e in reprise]
    assert "".join(e["delta"] for e in reprise if e["type"] == "TEXT_MESSAGE_CONTENT") == REPONSE
