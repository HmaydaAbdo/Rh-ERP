"""Sonde de santé du conteneur (healthcheck Docker) : l'application répond et la base répond.

Publique et hors du schéma OpenAPI ; jamais auditée ni tracée (décision du propriétaire : pas de bruit de santé).
"""

from fastapi import APIRouter, Request, Response
from sqlalchemy import text

sante = APIRouter(include_in_schema=False)


@sante.get("/health")
async def verifier(requete: Request, reponse: Response) -> dict[str, str]:
    fabrique = getattr(requete.app.state, "fabrique_sessions", None)
    if fabrique is not None:
        try:
            async with fabrique() as session:
                await session.execute(text("SELECT 1"))
        except Exception:  # toute panne de base rend le conteneur non sain
            reponse.status_code = 503
            return {"status": "DOWN"}
    return {"status": "UP"}
