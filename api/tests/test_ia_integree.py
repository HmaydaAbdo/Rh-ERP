"""Preuve que l'IA et l'API utilisent la même application FastAPI."""

from erp_rh_ia.config import Settings
from fastapi.testclient import TestClient

from staport.main import creer_app


def test_route_agui_et_sante_ia_dans_application_api() -> None:
    ia = Settings(
        enabled=False,
        litellm_base_url="http://127.0.0.1:9/v1",  # pyright: ignore[reportArgumentType]
        litellm_api_key="sk-test-cle",  # pyright: ignore[reportArgumentType]
        erp_api_url="http://127.0.0.1:9",  # pyright: ignore[reportArgumentType]
    )
    app = creer_app(configuration_ia=ia)
    assert "/agui" in app.openapi()["paths"]
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "UP"}
        assert client.get("/health/ia").json()["ia"] == "DESACTIVEE"
        assert client.get("/health/ready").json()["ia"] == "DESACTIVEE"


def test_agui_exige_un_jeton_dans_application_api() -> None:
    ia = Settings(
        enabled=True,
        litellm_base_url="http://127.0.0.1:9/v1",  # pyright: ignore[reportArgumentType]
        litellm_api_key="sk-test-cle",  # pyright: ignore[reportArgumentType]
        erp_api_url="http://127.0.0.1:9",  # pyright: ignore[reportArgumentType]
    )
    corps: dict[str, object] = {
        "threadId": "t1",
        "runId": "r1",
        "state": {},
        "messages": [{"id": "m1", "role": "user", "content": "Bonjour"}],
        "tools": [],
        "context": [],
    }
    with TestClient(creer_app(configuration_ia=ia)) as client:
        assert client.post("/agui", json=corps).status_code == 401
