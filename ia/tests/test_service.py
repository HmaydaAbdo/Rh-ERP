import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from erp_rh_ia.app import creer_app, fabrique_reelle
from erp_rh_ia.config import Settings
from erp_rh_ia.modeles import Tache, modele


def _settings(enabled: bool = True, base_url: str = "http://litellm:4000/v1") -> Settings:
    return Settings(
        enabled=enabled,
        litellm_base_url=base_url,  # pyright: ignore[reportArgumentType]
        litellm_api_key="sk-test-cle",  # pyright: ignore[reportArgumentType]
        erp_api_url="http://backend:8080",  # pyright: ignore[reportArgumentType]
    )


def test_configuration_refuse_variable_manquante(monkeypatch: pytest.MonkeyPatch) -> None:
    for nom in ("IA_ENABLED", "IA_LITELLM_BASE_URL", "IA_LITELLM_API_KEY", "IA_ERP_API_URL"):
        monkeypatch.delenv(nom, raising=False)
    with pytest.raises(ValidationError):
        Settings()  # pyright: ignore[reportCallIssue]


def test_cle_jamais_affichee() -> None:
    assert "sk-test-cle" not in repr(_settings())


def test_le_modele_route_par_groupe_vers_la_passerelle() -> None:
    chat = modele(_settings(), Tache.COMPLEX)
    assert chat.model == "litellm_proxy/ai-gateway-complex"
    assert chat.api_base == "http://litellm:4000/v1"
    assert chat.model_kwargs == {"extra_body": {"metadata": {"tags": ["complex"]}}}
    assert chat.streaming and chat.max_retries == 0
    assert chat.max_tokens is None
    assert not any(cle.startswith("emit-") for cle in chat.metadata or {})


def test_un_modele_interne_ne_diffuse_rien_dans_le_fil() -> None:
    """Résumé et choix des outils : sans flux et retenus hors du fil (ag-ui-langgraph et CopilotKit)."""
    chat = modele(_settings(), Tache.SIMPLE, interne=True)
    assert chat.max_tokens is None
    assert not chat.streaming
    assert chat.metadata is not None
    assert (
        chat.metadata.items()
        >= {
            "emit-messages": False,
            "emit-tool-calls": False,
            "copilotkit:emit-messages": False,
            "copilotkit:emit-tool-calls": False,
        }.items()
    )


def test_la_fabrique_active_toujours_le_selecteur_officiel(monkeypatch: pytest.MonkeyPatch) -> None:
    modeles: list[tuple[Tache, object]] = []
    agents: list[dict[str, object]] = []

    def modele_factice(settings: Settings, tache: Tache, **kwargs: object) -> object:
        resultat = object()
        modeles.append((tache, resultat))
        return resultat

    def creer_agent_factice(principal: object, outils: object, **kwargs: object) -> object:
        agents.append(kwargs)
        return object()

    monkeypatch.setattr("erp_rh_ia.app.modele", modele_factice)
    monkeypatch.setattr("erp_rh_ia.app.creer_agent", creer_agent_factice)
    fabrique = fabrique_reelle(_settings())

    fabrique([], None)  # type: ignore[arg-type]

    assert [tache for tache, _ in modeles] == [Tache.COMPLEX, Tache.SELECTEUR, Tache.SIMPLE]
    assert agents[0]["selecteur"] is modeles[1][1]


def test_sante_ne_depend_de_rien() -> None:
    with TestClient(creer_app(_settings())) as client:
        reponse = client.get("/health")
    assert reponse.status_code == 200
    assert reponse.json() == {"status": "UP", "ia": "ACTIVE", "passerelle": "NON_VERIFIEE"}


def test_pret_quand_ia_desactivee() -> None:
    with TestClient(creer_app(_settings(enabled=False))) as client:
        reponse = client.get("/health/ready")
    assert reponse.status_code == 200
    assert reponse.json()["ia"] == "DESACTIVEE"


def test_pas_pret_sans_passerelle() -> None:
    # Port local fermé : aucune requête ne sort du poste.
    with TestClient(creer_app(_settings(base_url="http://127.0.0.1:9/v1"))) as client:
        reponse = client.get("/health/ready")
    assert reponse.status_code == 503
    assert reponse.json() == {"status": "DOWN", "ia": "ACTIVE", "passerelle": "INDISPONIBLE"}


def test_pret_quand_la_passerelle_repond() -> None:
    def repondre(requete: httpx.Request) -> httpx.Response:
        return httpx.Response(200 if requete.url.path == "/health/readiness" else 404)

    app = creer_app(_settings())
    with TestClient(app) as client:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(repondre))
        reponse = client.get("/health/ready")
    assert reponse.json() == {"status": "UP", "ia": "ACTIVE", "passerelle": "PRETE"}
