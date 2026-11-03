"""Contexte de la requête courante (parité avec `MdcRequestFilter` de Spring et la résolution du contexte d'audit).

L'identifiant est **toujours généré ici**, jamais repris d'un en-tête du client (un client ne doit pas pouvoir le
choisir) ; il relie journaux techniques et journal d'audit et est renvoyé dans `X-Request-Id`. Le contexte est un objet
mutable posé dans une variable de contexte : l'authentification y inscrit l'utilisateur, visible de tout le traitement
même quand une dépendance s'exécute dans un autre fil.
"""

import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from dataclasses import dataclass

from fastapi import FastAPI, Request, Response

EN_TETE_REQUEST_ID = "X-Request-Id"
USER_AGENT_LONGUEUR_MAX = 255


@dataclass
class ContexteRequete:
    request_id: str
    adresse_ip: str | None
    user_agent: str | None
    utilisateur_id: int | None = None
    utilisateur_nom: str | None = None


_contexte: ContextVar[ContexteRequete | None] = ContextVar("contexte_requete", default=None)


def contexte_requete() -> ContexteRequete | None:
    return _contexte.get()


def request_id_courant() -> str | None:
    contexte = _contexte.get()
    return contexte.request_id if contexte else None


def enregistrer_identifiant_requete(app: FastAPI) -> None:
    @app.middleware("http")
    async def _poser(  # pyright: ignore[reportUnusedFunction]
        requete: Request, suite: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        identifiant = str(uuid.uuid4())
        agent = requete.headers.get("User-Agent")
        contexte = ContexteRequete(
            request_id=identifiant,
            adresse_ip=requete.client.host if requete.client else None,
            user_agent=agent[:USER_AGENT_LONGUEUR_MAX] if agent else None,
        )
        jeton = _contexte.set(contexte)
        try:
            reponse = await suite(requete)
        finally:
            _contexte.reset(jeton)
        reponse.headers[EN_TETE_REQUEST_ID] = identifiant
        return reponse
