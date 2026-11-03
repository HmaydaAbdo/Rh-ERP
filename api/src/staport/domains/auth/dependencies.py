"""Dépendances FastAPI du domaine auth : contexte, utilisateur authentifié, contrôle des permissions."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request

from staport.domains.auth.composition import ContexteAuth
from staport.domains.auth.securite import JetonAcces, JetonInvalide
from staport.domains.common.securite import ActionSecurite, EvenementSecurite
from staport.platform.erreurs import AccesRefuse, NonAuthentifie


def contexte_auth(requete: Request) -> ContexteAuth:
    return requete.app.state.auth


Contexte = Annotated[ContexteAuth, Depends(contexte_auth)]


def _jeton_bearer(requete: Request) -> str | None:
    en_tete = requete.headers.get("Authorization", "")
    schema, _, valeur = en_tete.partition(" ")
    return valeur.strip() if schema.lower() == "bearer" and valeur.strip() else None


def authentifie(requete: Request, contexte: Contexte) -> JetonAcces:
    """Jeton d'accès valide (RS256, émetteur, destinataire, échéance, claims requis) ou 401 sans corps."""
    brut = _jeton_bearer(requete)
    if brut is None:
        _refuser_anonyme(contexte)
        raise NonAuthentifie
    try:
        return contexte.emetteur.verifier_acces(brut)
    except JetonInvalide:
        _refuser_anonyme(contexte)
        raise NonAuthentifie(jeton_invalide=True) from None


def _refuser_anonyme(contexte: ContexteAuth) -> None:
    contexte.evenements.publier(EvenementSecurite(ActionSecurite.ACCES_ANONYME_REFUSE, motif="HTTP_401"))


Authentifie = Annotated[JetonAcces, Depends(authentifie)]


def exiger(*autorites: str) -> Callable[..., JetonAcces]:
    """`hasAuthority` / `hasAnyAuthority` : au moins une des autorités (permissions ou rôles du jeton)."""

    def verifier(acces: Authentifie, contexte: Contexte) -> JetonAcces:
        if not set(autorites) & (acces.permissions | acces.roles):
            contexte.evenements.publier(
                EvenementSecurite(
                    ActionSecurite.ACCES_REFUSE,
                    acces.utilisateur_id,
                    acces.username,
                    details={"requises": sorted(autorites)},
                )
            )
            raise AccesRefuse
        return acces

    return verifier
