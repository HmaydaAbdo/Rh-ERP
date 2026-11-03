"""Création de l'application FastAPI unique (ADR 0016 § 1). Le prototype ne monte que le transverse de `common`."""

from fastapi import FastAPI

from staport.platform.erreurs import enregistrer_gestionnaires
from staport.platform.requete import enregistrer_identifiant_requete


def creer_app() -> FastAPI:
    app = FastAPI(title="Staport Intelligence")
    enregistrer_gestionnaires(app)
    enregistrer_identifiant_requete(app)
    return app


app = creer_app()
