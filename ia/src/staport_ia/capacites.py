"""Capacités du service pour la discussion (KAN-93) : la discussion n'affiche que des contrôles qui fonctionnent."""

from collections.abc import Callable

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from staport_ia.agui import AccesErp, _jeton  # pyright: ignore[reportPrivateUsage]


class Capacites(BaseModel):
    piecesJointes: bool


def routeur_capacites(
    acces: Callable[[], AccesErp], actif: Callable[[], bool], pieces_jointes: Callable[[], bool]
) -> APIRouter:
    routeur = APIRouter()

    @routeur.get("/capacites")
    async def lire(requete: Request) -> Capacites:  # pyright: ignore[reportUnusedFunction]
        if not actif():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Assistant IA désactivé.")
        autorisation = requete.headers.get("authorization", "")
        if not autorisation.lower().startswith("bearer ") or not autorisation[7:].strip():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Connexion requise.")
        await _jeton(acces(), autorisation[7:].strip())
        return Capacites(piecesJointes=pieces_jointes())

    return routeur
