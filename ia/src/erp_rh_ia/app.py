# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Application HTTP du service IA : santé et point d'entrée AG-UI ``POST /agui`` (docs/ia.md, T11)."""

from collections.abc import AsyncGenerator, Sequence
from contextlib import asynccontextmanager
from typing import Any, Literal

import httpx
from fastapi import FastAPI, Response, status
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel

from erp_rh_ia.agent import creer_agent
from erp_rh_ia.agui import AccesErp, AccesSpring, FabriqueAgent, routeur_agui
from erp_rh_ia.config import Settings, get_settings
from erp_rh_ia.memoire import ouvrir_memoire
from erp_rh_ia.modeles import Tache, modele


class Sante(BaseModel):
    status: Literal["UP", "DOWN"]
    ia: Literal["ACTIVE", "DESACTIVEE"]
    passerelle: Literal["PRETE", "INDISPONIBLE", "NON_VERIFIEE"]


def fabrique_reelle(config: Settings) -> FabriqueAgent:
    """L'agent servi : modèle ``complex`` pour répondre, ``simple`` pour choisir les outils utiles."""
    # Raisonnement court : chaque appel de l'agent est plus rapide, le raisonnement reste affiché.
    principal = modele(config, Tache.COMPLEX, raisonnement="low")
    selecteur = modele(config, Tache.SIMPLE, max_tokens=300, interne=True) if config.selection_outils else None
    # Résume le début d'une conversation devenue longue ; le résumé reste interne, jamais affiché dans le fil.
    resumeur = modele(config, Tache.SIMPLE, max_tokens=1500, interne=True)

    def fabriquer(
        outils: Sequence[BaseTool], checkpointer: BaseCheckpointSaver[Any]
    ) -> CompiledStateGraph[Any, Any, Any, Any]:
        return creer_agent(principal, outils, selecteur=selecteur, resumeur=resumeur, checkpointer=checkpointer)

    return fabriquer


def creer_app(
    settings: Settings | None = None, fabrique: FabriqueAgent | None = None, acces: AccesErp | None = None
) -> FastAPI:
    """``fabrique`` et ``acces`` remplacent les modèles et Spring dans les tests ; absents, les vrais sont créés."""
    config = settings or get_settings()

    @asynccontextmanager
    async def cycle(app: FastAPI) -> AsyncGenerator[None]:
        url = config.database_url.get_secret_value() if config.database_url else None
        async with httpx.AsyncClient(timeout=30.0) as client, ouvrir_memoire(url, config.conversation_jours) as memoire:
            app.state.http = client
            app.state.memoire = memoire
            app.state.fabrique = fabrique or fabrique_reelle(config)
            app.state.acces = acces or AccesSpring(client, str(config.erp_api_url))
            yield

    app = FastAPI(title="ERP-RH IA", docs_url=None, redoc_url=None, openapi_url=None, lifespan=cycle)
    app.include_router(
        routeur_agui(
            fabrique=lambda: app.state.fabrique,
            acces=lambda: app.state.acces,
            actif=lambda: config.enabled,
            memoire=lambda: app.state.memoire,
        )
    )

    @app.get("/health")
    async def vivant() -> Sante:  # pyright: ignore[reportUnusedFunction]
        """Le processus répond ; ne dépend d'aucun service externe."""
        return Sante(status="UP", ia="ACTIVE" if config.enabled else "DESACTIVEE", passerelle="NON_VERIFIEE")

    @app.get("/health/ready")
    async def pret(response: Response) -> Sante:  # pyright: ignore[reportUnusedFunction]
        """Prêt à servir : IA désactivée, ou passerelle LiteLLM joignable (sa sonde de disponibilité officielle)."""
        if not config.enabled:
            return Sante(status="UP", ia="DESACTIVEE", passerelle="NON_VERIFIEE")
        racine = str(config.litellm_base_url).rstrip("/").removesuffix("/v1")
        try:
            pret = (await app.state.http.get(f"{racine}/health/readiness", timeout=5.0)).status_code == 200
        except httpx.HTTPError:
            pret = False
        if pret:
            return Sante(status="UP", ia="ACTIVE", passerelle="PRETE")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Sante(status="DOWN", ia="ACTIVE", passerelle="INDISPONIBLE")

    return app
