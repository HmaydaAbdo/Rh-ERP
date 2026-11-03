"""Création de l'application FastAPI unique (ADR 0016 § 1).

`creer_app()` sans argument monte le transverse seul (gestionnaires d'erreurs, identifiant de requête) : c'est la base
des tests de `common`. Avec une configuration, elle monte aussi les domaines migrés (auth) et leur cycle de vie.
Démarrage : `uvicorn staport.main:application --factory`.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from staport.domains.audit import router as routes_audit
from staport.domains.audit.api import Audit, VerificationIntegrite
from staport.domains.auth import router as routes_auth
from staport.domains.auth.composition import ContexteAuth, creer_contexte
from staport.domains.common.audit_contexte import Origine, contexte_batch
from staport.platform.base_de_donnees import creer_fabrique_sessions, creer_moteur
from staport.platform.configuration import Configuration, configuration
from staport.platform.erreurs import enregistrer_gestionnaires
from staport.platform.requete import EN_TETE_REQUEST_ID, enregistrer_identifiant_requete


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
) -> FastAPI:
    @asynccontextmanager
    async def cycle_de_vie(app: FastAPI) -> AsyncGenerator[None]:
        if configuration_ is None:
            yield
            return
        moteur_ = moteur or creer_moteur(configuration_.url_application())
        fabrique = creer_fabrique_sessions(moteur_)
        app.state.fabrique_sessions = fabrique
        app.state.auth = contexte or creer_contexte(configuration_)
        audit = app.state.auth.audit
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
        try:
            yield
        finally:
            if verification is not None:
                await verification.arreter()
            await app.state.auth.courriel.attendre_envois()
            if moteur is None:
                await moteur_.dispose()

    app = FastAPI(title="Staport Intelligence", lifespan=cycle_de_vie)
    enregistrer_gestionnaires(app)
    enregistrer_identifiant_requete(app)
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
        for routeur in (
            routes_auth.auth,
            routes_auth.agent,
            routes_auth.utilisateurs,
            routes_auth.roles,
            routes_audit.logs,
        ):
            app.include_router(routeur)
    return app


def application() -> FastAPI:
    return creer_app(configuration())
