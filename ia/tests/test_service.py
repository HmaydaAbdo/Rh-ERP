import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from erp_rh_ia.app import creer_app
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


def test_le_modele_route_par_tag_vers_la_passerelle() -> None:
    chat = modele(_settings(), Tache.COMPLEX)
    assert chat.model == "litellm_proxy/ai-gateway"
    assert chat.api_base == "http://litellm:4000/v1"
    assert chat.model_kwargs == {"extra_body": {"metadata": {"tags": ["complex"]}}}
    assert chat.streaming and chat.max_retries == 0


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
