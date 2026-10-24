"""Application HTTP du service IA. Les routes AG-UI arrivent avec la tâche T7 (docs/ia.md)."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, Response, status
from pydantic import BaseModel

from erp_rh_ia.config import Settings, get_settings
from erp_rh_ia.llm import passerelle_prete


class Sante(BaseModel):
    status: Literal["UP", "DOWN"]
    ia: Literal["ACTIVE", "DESACTIVEE"]
    passerelle: Literal["PRETE", "INDISPONIBLE", "NON_VERIFIEE"]


def creer_app(settings: Settings | None = None) -> FastAPI:
    config = settings or get_settings()

    @asynccontextmanager
    async def cycle(app: FastAPI) -> AsyncGenerator[None]:
        async with httpx.AsyncClient() as client:
            app.state.http = client
            yield

    app = FastAPI(title="ERP-RH IA", docs_url=None, redoc_url=None, openapi_url=None, lifespan=cycle)

    @app.get("/health")
    async def vivant() -> Sante:  # pyright: ignore[reportUnusedFunction]
        """Le processus répond ; ne dépend d'aucun service externe."""
        return Sante(status="UP", ia=_etat_ia(config), passerelle="NON_VERIFIEE")

    @app.get("/health/ready")
    async def pret(response: Response) -> Sante:  # pyright: ignore[reportUnusedFunction]
        """Prêt à servir : IA désactivée, ou passerelle LiteLLM joignable."""
        if not config.enabled:
            return Sante(status="UP", ia="DESACTIVEE", passerelle="NON_VERIFIEE")
        client: httpx.AsyncClient = app.state.http
        if await passerelle_prete(config, client):
            return Sante(status="UP", ia="ACTIVE", passerelle="PRETE")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Sante(status="DOWN", ia="ACTIVE", passerelle="INDISPONIBLE")

    return app


def _etat_ia(config: Settings) -> Literal["ACTIVE", "DESACTIVEE"]:
    return "ACTIVE" if config.enabled else "DESACTIVEE"
