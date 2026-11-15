"""Preuve que l'IA et l'API utilisent la même application FastAPI."""

import asyncio
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from staport_ia.config import Settings

from staport.main import creer_app

# psycopg asynchrone refuse la boucle Proactor de Windows : boucle à sélecteur, celle de Linux (voir conftest.py).
SELECTEUR = {"loop_factory": asyncio.SelectorEventLoop}


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


def test_agui_exige_un_jeton_dans_application_api(creer_base: Callable[[str], str]) -> None:
    # La base de l'IA est obligatoire, comme en production (KAN-39) : une base vierge, au format psycopg.
    base = make_url(creer_base("ia_integree")).set(drivername="postgresql").render_as_string(hide_password=False)
    ia = Settings(
        enabled=True,
        database_url=base,  # pyright: ignore[reportArgumentType]
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
    with TestClient(creer_app(configuration_ia=ia), backend_options=SELECTEUR) as client:
        assert client.post("/agui", json=corps).status_code == 401


def test_l_ia_activee_sans_base_refuse_de_demarrer_dans_application_api() -> None:
    ia = Settings(
        enabled=True,
        litellm_base_url="http://127.0.0.1:9/v1",  # pyright: ignore[reportArgumentType]
        litellm_api_key="sk-test-cle",  # pyright: ignore[reportArgumentType]
        erp_api_url="http://127.0.0.1:9",  # pyright: ignore[reportArgumentType]
    )
    with (
        pytest.raises(RuntimeError, match="IA_DATABASE_URL est obligatoire"),
        TestClient(creer_app(configuration_ia=ia)),
    ):
        pass
