"""Création de l'application FastAPI unique (ADR 0016 § 1).

`creer_app()` sans argument monte le transverse seul (gestionnaires d'erreurs, identifiant de requête) : c'est la base
des tests de `common`. Avec une configuration, elle monte aussi les domaines migrés (auth) et leur cycle de vie.
Démarrage : `uvicorn staport.main:application --factory`.
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from http import HTTPStatus
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastmcp.utilities.lifespan import combine_lifespans
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Route

from staport.domains.accueil import router as routes_accueil
from staport.domains.audit import router as routes_audit
from staport.domains.audit.api import Audit, MetriquesAudit, VerificationIntegrite
from staport.domains.auth import router as routes_auth
from staport.domains.auth.composition import ContexteAuth, creer_contexte
from staport.domains.chantier import audit as _historique_chantier  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.chantier import router as routes_chantier
from staport.domains.chantier.planification import PlanificationSynchronisation
from staport.domains.common.audit_contexte import Origine, contexte_batch
from staport.domains.employee import audit as _historique_employee  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.employee import router as routes_employee
from staport.domains.equipe import audit as _historique_equipe  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.equipe import router as routes_equipe
from staport.domains.function import audit as _historique_function  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.function import router as routes_function
from staport.domains.heuresupp import router as routes_heuresupp
from staport.domains.mcp.serveur import CHEMIN as CHEMIN_MCP
from staport.domains.mcp.serveur import creer_serveur
from staport.domains.paie import audit as _historique_paie  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.domains.paie import router as routes_paie
from staport.domains.parametre import router as routes_parametre
from staport.platform.base_de_donnees import creer_fabrique_sessions, creer_moteur
from staport.platform.configuration import Configuration, configuration
from staport.platform.erreurs import enregistrer_gestionnaires, reponse
from staport.platform.journalisation import configurer_journalisation
from staport.platform.metriques import TYPE_CONTENU, creer_registre, exporter
from staport.platform.requete import EN_TETE_REQUEST_ID, EN_TETES_SECURITE, enregistrer_identifiant_requete
from staport.platform.sante import sante

if TYPE_CHECKING:
    from erp_rh_ia.config import Settings as SettingsIA


TAILLE_MAX_TELEVERSEMENT = 20 * 1024 * 1024


async def _amorcer_admin(
    contexte: ContexteAuth, configuration_: Configuration, fabrique: async_sessionmaker[AsyncSession]
) -> None:
    """Crée le compte SYSTEM_ADMIN initial s'il n'existe aucun administrateur (équivalent d'`AdminBootstrapRunner`)."""
    async with fabrique() as session:
        if await contexte.utilisateurs.admin_existe(session):
            return
    with contexte_batch("Système", Origine.DEMARRAGE):
        async with fabrique() as session:
            await contexte.utilisateurs.creer_admin_initial(
                session,
                configuration_.admin_username,
                configuration_.admin_email,
                configuration_.admin_password.get_secret_value(),
            )


def creer_app(
    configuration_: Configuration | None = None,
    moteur: AsyncEngine | None = None,
    contexte: ContexteAuth | None = None,
    amorcer_admin: bool = True,
    configuration_ia: SettingsIA | None = None,
    planifier_synchronisation: bool = True,
) -> FastAPI:
    @asynccontextmanager
    async def cycle_de_vie(app: FastAPI) -> AsyncGenerator[None]:
        if configuration_ is None:
            yield
            return
        moteur_ = moteur or creer_moteur(configuration_.url_application())
        fabrique = creer_fabrique_sessions(moteur_)
        app.state.fabrique_sessions = fabrique
        app.state.configuration = configuration_
        app.state.auth = contexte or creer_contexte(configuration_)
        audit = app.state.auth.audit
        app.state.registre_metriques = creer_registre(
            audit.metriques if isinstance(audit, Audit) else MetriquesAudit(), app.state.auth.chantiers.metriques
        )
        verification: VerificationIntegrite | None = None
        if isinstance(audit, Audit):
            audit.lier(fabrique)
            verification = VerificationIntegrite(
                fabrique, audit.metriques, configuration_.audit_integrite_chaine_delai_ms
            )
        if amorcer_admin:
            await _amorcer_admin(app.state.auth, configuration_, fabrique)
        if verification is not None:
            await verification.demarrer()
        planification: PlanificationSynchronisation | None = None
        if planifier_synchronisation:
            planification = PlanificationSynchronisation(
                fabrique, app.state.auth.parametres, app.state.auth.chantiers, configuration_.chantier_sync_base_url
            )
            planification.demarrer()
        try:
            yield
        finally:
            if planification is not None:
                await planification.arreter()
            if verification is not None:
                await verification.arreter()
            await app.state.auth.courriel.attendre_envois()
            if moteur is None:
                await moteur_.dispose()

    application_mcp = (
        creer_serveur(lambda: app.state.auth, lambda: app.state.fabrique_sessions)
        if configuration_ is not None and configuration_.mcp_enabled
        else None
    )
    # Le cycle de vie de l'application MCP (gestionnaire de sessions) appartient à l'application hôte.
    vie = cycle_de_vie
    if application_mcp is not None:
        vie = combine_lifespans(vie, application_mcp.lifespan)
    if configuration_ia is not None:
        from erp_rh_ia.app import cycle_ia

        vie = combine_lifespans(vie, cycle_ia(configuration_ia))
    if configuration_ is not None:
        configurer_journalisation(configuration_.logging_format, configuration_.logging_file_path)
    documentation_allumee = configuration_ is not None and configuration_.springdoc_api_docs_enabled
    interface_allumee = (
        documentation_allumee and configuration_ is not None and configuration_.springdoc_swagger_ui_enabled
    )
    app = FastAPI(
        title="Staport Intelligence",
        lifespan=vie,
        openapi_url="/openapi.json" if documentation_allumee else None,
        docs_url="/docs" if interface_allumee else None,
        redoc_url=None,
    )
    enregistrer_gestionnaires(app)
    enregistrer_identifiant_requete(app)
    app.include_router(sante)

    @app.get("/metrics", include_in_schema=False)
    async def metriques(requete: Request) -> Response:
        """Mesures Prometheus ; non relayé par nginx, joignable depuis le serveur seulement."""
        registre = getattr(requete.app.state, "registre_metriques", None)
        if registre is None:
            return Response(status_code=HTTPStatus.SERVICE_UNAVAILABLE)
        return Response(exporter(registre), media_type=TYPE_CONTENU)

    if configuration_ia is not None:
        from erp_rh_ia.app import routeur_ia

        app.include_router(routeur_ia(app, configuration_ia))
    if configuration_ is not None:
        origines = sorted(o.strip() for o in configuration_.cors_allowed_origins.split(","))
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origines,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
            expose_headers=[EN_TETE_REQUEST_ID],
            allow_credentials=True,
        )

        @app.middleware("http")
        async def _limiter_televersement(requete: Request, suite: Callable[[Request], Awaitable[Response]]) -> Response:
            """`spring.servlet.multipart.max-request-size: 20MB` : Spring coupe la connexion, l'API répond 413."""
            taille = requete.headers.get("content-length", "")
            multipart = requete.headers.get("content-type", "").startswith("multipart/form-data")
            if multipart and taille.isdigit() and int(taille) > TAILLE_MAX_TELEVERSEMENT:
                reponse_413 = reponse(
                    requete, HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Fichier trop volumineux : 20 Mo maximum."
                )
                for nom, valeur in EN_TETES_SECURITE.items():
                    reponse_413.headers.setdefault(nom, valeur)
                return reponse_413
            return await suite(requete)

        @app.middleware("http")
        async def _refuser_origine_inconnue(
            requete: Request, suite: Callable[[Request], Awaitable[Response]]
        ) -> Response:
            """Comme `DefaultCorsProcessor` de Spring : origine inconnue (hors même origine) = 403."""
            origine = requete.headers.get("origin")
            if origine is not None and origine not in origines and origine != str(requete.base_url).rstrip("/"):
                return Response("Invalid CORS request", status_code=403, headers=EN_TETES_SECURITE)
            return await suite(requete)

        for routeur in (
            routes_auth.auth,
            routes_auth.agent,
            routes_auth.utilisateurs,
            routes_auth.roles,
            routes_audit.logs,
            routes_parametre.parametres,
            routes_accueil.accueil,
            routes_function.fonctions,
            routes_equipe.equipes,
            routes_chantier.chantiers,
            routes_employee.employees,
            routes_paie.paies,
            routes_heuresupp.heures_supp,
            routes_heuresupp.imports,
        ):
            app.include_router(routeur)
        if application_mcp is not None:
            # Une route (et non un montage à la racine) : les autres chemins gardent leurs 404 et 405 de FastAPI.
            app.router.routes.append(Route(CHEMIN_MCP, endpoint=application_mcp))
    return app


def application() -> FastAPI:
    if "IA_ENABLED" not in os.environ:
        return creer_app(configuration())
    from erp_rh_ia.config import get_settings

    return creer_app(configuration(), configuration_ia=get_settings())
