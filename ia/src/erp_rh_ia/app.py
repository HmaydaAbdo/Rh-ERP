"""Application HTTP du service IA : santé et point d'entrée AG-UI ``POST /agui`` (docs/ia.md, T7)."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, Response, status
from pydantic import BaseModel

from erp_rh_ia.agent import Agent
from erp_rh_ia.agui import AccesErp, AccesSpring, routeur_agui
from erp_rh_ia.config import Settings, get_settings
from erp_rh_ia.llm import creer_client, passerelle_prete
from erp_rh_ia.modele import ModeleLiteLLM


class Sante(BaseModel):
    status: Literal["UP", "DOWN"]
    ia: Literal["ACTIVE", "DESACTIVEE"]
    passerelle: Literal["PRETE", "INDISPONIBLE", "NON_VERIFIEE"]


def creer_app(settings: Settings | None = None, agent: Agent | None = None, acces: AccesErp | None = None) -> FastAPI:
    """``agent`` et ``acces`` remplacent le modèle LiteLLM et Spring dans les tests ; absents, les vrais sont créés."""
    config = settings or get_settings()

    @asynccontextmanager
    async def cycle(app: FastAPI) -> AsyncGenerator[None]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            app.state.http = client
            app.state.agent = agent or Agent(ModeleLiteLLM(creer_client(config), config.litellm_model))
            app.state.acces = acces or AccesSpring(client, str(config.erp_api_url))
            yield

    app = FastAPI(title="ERP-RH IA", docs_url=None, redoc_url=None, openapi_url=None, lifespan=cycle)
    app.include_router(
        routeur_agui(agent=lambda: app.state.agent, acces=lambda: app.state.acces, actif=lambda: config.enabled)
    )

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
