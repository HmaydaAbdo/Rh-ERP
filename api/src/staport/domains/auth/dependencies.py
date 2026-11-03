"""Dépendances FastAPI du domaine auth : contexte, utilisateur authentifié, contrôle des permissions."""

import re
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request

from staport.domains.auth.composition import ContexteAuth
from staport.domains.auth.securite import JetonAcces, JetonInvalide
from staport.domains.common.securite import ActionSecurite, EvenementSecurite
from staport.platform.erreurs import AccesRefuse, NonAuthentifie
from staport.platform.requete import contexte_requete


def contexte_auth(requete: Request) -> ContexteAuth:
    return requete.app.state.auth


Contexte = Annotated[ContexteAuth, Depends(contexte_auth)]


def _jeton_bearer(requete: Request) -> str | None:
    en_tete = requete.headers.get("Authorization", "")
    schema, _, valeur = en_tete.partition(" ")
    return valeur.strip() if schema.lower() == "bearer" and valeur.strip() else None


_IDENTIFIANT = re.compile(r"\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)


def _route_sans_identifiants(chemin: str) -> str:
    """Route d'un refus avant le routage : conserve l'action demandée sans exposer un identifiant du chemin."""
    return "/".join("{id}" if _IDENTIFIANT.fullmatch(segment) else segment for segment in chemin.split("/")) or "/"


async def authentifie(requete: Request, contexte: Contexte) -> JetonAcces:
    """Jeton d'accès valide (RS256, émetteur, destinataire, échéance, claims requis) ou 401 sans corps."""
    brut = _jeton_bearer(requete)
    if brut is None:
        await _refuser_anonyme(requete, contexte)
        raise NonAuthentifie
    try:
        acces = contexte.emetteur.verifier_acces(brut)
    except JetonInvalide:
        await _refuser_anonyme(requete, contexte)
        raise NonAuthentifie(jeton_invalide=True) from None
    courant = contexte_requete()
    if courant is not None:  # l'utilisateur authentifié est l'acteur de tout ce que la requête écrit dans l'audit
        courant.utilisateur_id = acces.utilisateur_id
        courant.utilisateur_nom = acces.username
    return acces


async def _refuser_anonyme(requete: Request, contexte: ContexteAuth) -> None:
    await contexte.audit.publier(
        EvenementSecurite(
            ActionSecurite.ACCES_ANONYME_REFUSE,
            motif="HTTP_401",
            details={
                "methode": requete.method,
                "route": _route_sans_identifiants(requete.url.path),
                "statutHttp": 401,
            },
        )
    )


Authentifie = Annotated[JetonAcces, Depends(authentifie)]


def exiger(*autorites: str) -> Callable[..., Awaitable[JetonAcces]]:
    """`hasAuthority` / `hasAnyAuthority` : au moins une des autorités (permissions ou rôles du jeton)."""

    async def verifier(requete: Request, acces: Authentifie, contexte: Contexte) -> JetonAcces:
        if not set(autorites) & (acces.permissions | acces.roles):
            await contexte.audit.publier(
                EvenementSecurite(
                    ActionSecurite.ACCES_REFUSE,
                    acces.utilisateur_id,
                    acces.username,
                    details={"methode": requete.method, "route": requete.url.path},
                )
            )
            raise AccesRefuse
        return acces

    return verifier
