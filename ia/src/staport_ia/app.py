# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Application HTTP du service IA : santé et point d'entrée AG-UI ``POST /agui`` (site/docs/ia, T11)."""

import signal
from collections.abc import AsyncGenerator, Callable, Generator, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager, contextmanager
from types import FrameType
from typing import Any, Literal

import httpx
from fastapi import APIRouter, FastAPI, Response, status
from langchain_core.tools import BaseTool
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.store.base import BaseStore
from pydantic import BaseModel

from staport_ia.agent import creer_agent
from staport_ia.agui import AccesErp, AccesHttp, FabriqueAgent, Routage, demander_arret, routeur_agui
from staport_ia.bureautique import complement_bureautique
from staport_ia.capacites import routeur_capacites
from staport_ia.competences import semer_competences
from staport_ia.config import Settings, get_settings
from staport_ia.fichiers import routeur_fichiers
from staport_ia.memoire import Memoire, ouvrir_memoire
from staport_ia.modeles import Tache, modele
from staport_ia.pieces_jointes import Analyseur, AnalyseurClamd
from staport_ia.routage import Routeur
from staport_ia.souvenirs import routeur_souvenirs
from staport_ia.titres import routeur_titres


class Sante(BaseModel):
    status: Literal["UP", "DOWN"]
    ia: Literal["ACTIVE", "DESACTIVEE"]
    passerelle: Literal["PRETE", "INDISPONIBLE", "NON_VERIFIEE"]


def fabrique_reelle(config: Settings, espaces: BaseStore) -> FabriqueAgent:
    """L'agent servi : ``complex`` pour répondre ; les outils sont choisis hors modèle (``routage.py``)."""
    # Laisser le fournisseur appliquer son comportement natif : `reasoning_effort` est incompatible avec certains
    # modèles Gemma 4 derrière LiteLLM et provoque une erreur 400 pendant le basculement.
    principal = modele(config, Tache.COMPLEX)
    # Résume le début d'une conversation devenue longue ; le résumé reste interne, jamais affiché dans le fil.
    resumeur = modele(config, Tache.SIMPLE, interne=True)
    # Second filet (KAN-265) : un groupe LiteLLM d'une autre famille que le principal, sans flux interne.
    repli = [modele(config, Tache(config.llm_repli))] if config.llm_repli else []

    def fabriquer(
        outils: Sequence[BaseTool], checkpointer: BaseCheckpointSaver[Any] | None, utilisateur: str
    ) -> CompiledStateGraph[Any, Any, Any, Any]:
        return creer_agent(
            principal,
            outils,
            resumeur=resumeur,
            checkpointer=checkpointer,
            utilisateur=utilisateur,
            store=espaces,
            repli=repli,
            sous_agents=config.sous_agents,
            dossier_bureautique=config.bureautique_dossier if complement_bureautique(config) else None,
        )

    return fabriquer


#: Ouvre la mémoire d'un test rapide (injection) ; absente en service.
FabriqueMemoire = Callable[[], AbstractAsyncContextManager[Memoire]]


def cycle_ia(
    config: Settings,
    fabrique: FabriqueAgent | None = None,
    acces: AccesErp | None = None,
    routage: Routage | None = None,
    memoire: FabriqueMemoire | None = None,
    analyseur: Analyseur | None = None,
) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    """``memoire`` n'est fournie que par les tests rapides ; le service ouvre toujours PostgreSQL (KAN-39)."""

    @asynccontextmanager
    async def cycle(app: FastAPI) -> AsyncGenerator[None]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            app.state.http = client
            # Antivirus des pièces jointes (KAN-93) : le client ne se connecte qu'à l'analyse d'un fichier.
            app.state.analyseur = analyseur or (
                AnalyseurClamd(config.antivirus_hote, config.antivirus_port) if config.antivirus_hote else None
            )
            if not config.enabled:  # service désactivé : aucune base à ouvrir, les routes répondent 503
                yield
                return
            with _arret_en_douceur():
                async with _ouvrir(config, memoire) as ouverte:
                    await semer_competences(ouverte.store)  # les fiches de compétences vivent dans le Store (KAN-259)
                    app.state.memoire = ouverte.checkpointer
                    app.state.store = ouverte.store
                    # Les fichiers d'espace par identité sont dans le Store de la même mémoire (PostgreSQL).
                    app.state.fabrique = fabrique or fabrique_reelle(config, ouverte.store)
                    app.state.routage = routage or Routeur().adomaines
                    app.state.acces = acces or AccesHttp(
                        client, str(config.erp_api_url), complement_bureautique(config)
                    )
                    yield

    return cycle


@contextmanager
def _arret_en_douceur() -> Generator[None]:
    """À SIGTERM (``docker compose up -d`` après un ``pull``), les runs en cours terminent leur étape, enregistrent un
    point de reprise et s'arrêtent (doc LangGraph, « SIGTERM hook pattern »). Le gestionnaire d'uvicorn est chaîné, pas
    remplacé : l'arrêt du serveur suit son cours."""
    try:
        precedent = signal.getsignal(signal.SIGTERM)

        def gestionnaire(numero: int, cadre: FrameType | None) -> None:
            demander_arret("sigterm")
            if callable(precedent):
                precedent(numero, cadre)

        signal.signal(signal.SIGTERM, gestionnaire)
    except ValueError:  # hors du fil principal (tests) : pas de signal à brancher
        yield
        return
    try:
        yield
    finally:
        signal.signal(signal.SIGTERM, precedent)


def _ouvrir(config: Settings, injectee: FabriqueMemoire | None) -> AbstractAsyncContextManager[Memoire]:
    if injectee is not None:
        return injectee()
    if config.database_url is None:
        raise RuntimeError(
            "IA_DATABASE_URL est obligatoire quand l'assistant IA est activé : sans base, les conversations et "
            "les fichiers des utilisateurs seraient perdus à chaque redémarrage."
        )
    return ouvrir_memoire(config.database_url.get_secret_value(), config.conversation_jours)


def routeur_ia(app: FastAPI, config: Settings) -> APIRouter:
    """Routes IA intégrables dans l'application API unique via ``include_router``."""
    routeur = APIRouter()
    routeur.include_router(
        routeur_agui(
            fabrique=lambda: app.state.fabrique,
            acces=lambda: app.state.acces,
            actif=lambda: config.enabled,
            memoire=lambda: app.state.memoire,
            routage=lambda: app.state.routage,
            pieces_jointes=lambda: config.pieces_jointes,
            analyseur=lambda: getattr(app.state, "analyseur", None),
        )
    )

    routeur.include_router(
        routeur_fichiers(acces=lambda: app.state.acces, actif=lambda: config.enabled, store=lambda: app.state.store)
    )

    routeur.include_router(
        routeur_souvenirs(acces=lambda: app.state.acces, actif=lambda: config.enabled, store=lambda: app.state.store)
    )

    routeur.include_router(routeur_titres(acces=lambda: app.state.acces, actif=lambda: config.enabled))
    routeur.include_router(
        routeur_capacites(
            acces=lambda: app.state.acces,
            actif=lambda: config.enabled,
            pieces_jointes=lambda: config.pieces_jointes and getattr(app.state, "analyseur", None) is not None,
        )
    )

    @routeur.get("/health/ia")
    async def vivant() -> Sante:  # pyright: ignore[reportUnusedFunction]
        return Sante(status="UP", ia="ACTIVE" if config.enabled else "DESACTIVEE", passerelle="NON_VERIFIEE")

    @routeur.get("/health/ready")
    async def pret(response: Response) -> Sante:  # pyright: ignore[reportUnusedFunction]
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

    return routeur


def creer_app(
    settings: Settings | None = None,
    fabrique: FabriqueAgent | None = None,
    acces: AccesErp | None = None,
    routage: Routage | None = None,
    memoire: FabriqueMemoire | None = None,
    analyseur: Analyseur | None = None,
) -> FastAPI:
    """Application IA autonome conservée pour les tests et la transition vers le conteneur unique."""
    config = settings or get_settings()

    app = FastAPI(
        title="Staport Intelligence IA",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=cycle_ia(config, fabrique, acces, routage, memoire, analyseur),
    )
    app.include_router(routeur_ia(app, config))

    @app.get("/health")
    async def vivant() -> Sante:  # pyright: ignore[reportUnusedFunction]
        """Le processus répond ; ne dépend d'aucun service externe."""
        return Sante(status="UP", ia="ACTIVE" if config.enabled else "DESACTIVEE", passerelle="NON_VERIFIEE")

    return app
