"""Routes HTTP du domaine auth : mêmes chemins, statuts, cookies et permissions que Spring (21 routes)."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.auth.dependencies import Authentifie, Contexte, authentifie, exiger
from staport.domains.auth.exceptions import RefreshTokenInvalide
from staport.domains.auth.schemas import (
    ConnexionReponse,
    JetonAgentReponse,
    LoginRequete,
    OubliMotDePasseRequete,
    PermissionReponse,
    PolitiqueMotDePasse,
    RefusPermissionsRequete,
    ReinitialisationAdminRequete,
    ReinitialisationRequete,
    RoleCreationRequete,
    RoleModificationRequete,
    RoleRecherche,
    RoleReponse,
    UtilisateurCreationRequete,
    UtilisateurModificationRequete,
    UtilisateurRecherche,
    UtilisateurReponse,
)
from staport.domains.auth.securite import JetonAcces
from staport.domains.auth.service_auth import Connexion
from staport.domains.common.pagination import Pagination, pagination
from staport.domains.common.schemas import Page
from staport.platform.base_de_donnees import session_requete
from staport.platform.erreurs import NonAuthentifie

COOKIE = "refresh_token"
CHEMIN_COOKIE = "/auth"

Session = Annotated[AsyncSession, Depends(session_requete)]
CookieRefresh = Annotated[str | None, Cookie(alias=COOKIE)]

auth = APIRouter(tags=["Authentification"])
utilisateurs = APIRouter(prefix="/users", tags=["Utilisateurs"], dependencies=[Depends(exiger("USER_MANAGE"))])
roles = APIRouter(tags=["Rôles"])
agent = APIRouter(tags=["Agent IA"])


def _poser_cookie(reponse: Response, connexion: Connexion, secure: bool) -> None:
    reponse.set_cookie(
        COOKIE,
        connexion.refresh_brut,
        max_age=int(connexion.duree_session.total_seconds()),
        path=CHEMIN_COOKIE,
        secure=secure,
        httponly=True,
        samesite="lax",
    )


def _origine_autorisee(requete: Request, contexte: Contexte) -> None:
    """`/auth/refresh` s'authentifie par cookie : l'origine est vérifiée côté serveur pour bloquer les POST CSRF."""
    origine = requete.headers.get("Origin")
    if origine is None or origine not in contexte.origines_autorisees:
        raise NonAuthentifie


# --- /auth ----------------------------------------------------------------------------------------


@auth.post("/auth/login", summary="Ouvrir une session")
async def login(corps: LoginRequete, reponse: Response, session: Session, contexte: Contexte) -> ConnexionReponse:
    connexion = await contexte.auth.login(session, corps.username, corps.password)
    _poser_cookie(reponse, connexion, contexte.cookie_secure)
    return connexion.reponse


@auth.post("/auth/refresh", summary="Renouveler la session")
async def refresh(
    requete: Request, reponse: Response, session: Session, contexte: Contexte, refresh_token: CookieRefresh = None
) -> ConnexionReponse:
    _origine_autorisee(requete, contexte)
    if refresh_token is None:
        raise RefreshTokenInvalide
    connexion = await contexte.auth.refresh(session, refresh_token)
    _poser_cookie(reponse, connexion, contexte.cookie_secure)
    return connexion.reponse


@auth.post(
    "/auth/logout",
    summary="Fermer la session",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(authentifie)],
    response_class=Response,
)
async def logout(session: Session, contexte: Contexte, refresh_token: CookieRefresh = None) -> Response:
    await contexte.auth.logout(session, refresh_token)
    reponse = Response(status_code=status.HTTP_204_NO_CONTENT)
    reponse.set_cookie(
        COOKIE, "", max_age=0, path=CHEMIN_COOKIE, secure=contexte.cookie_secure, httponly=True, samesite="lax"
    )
    return reponse


@auth.post(
    "/auth/forgot-password",
    summary="Demander un lien de réinitialisation",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=Response,
)
async def mot_de_passe_oublie(corps: OubliMotDePasseRequete, session: Session, contexte: Contexte) -> None:
    await contexte.auth.demander_reinitialisation(session, corps.email)


@auth.post(
    "/auth/reset-password",
    summary="Choisir un nouveau mot de passe",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def reinitialiser(corps: ReinitialisationRequete, session: Session, contexte: Contexte) -> None:
    await contexte.auth.reinitialiser_mot_de_passe(session, corps.token, corps.nouveau_mot_de_passe)


@auth.get("/auth/password-policy", summary="Lire la règle des mots de passe")
async def politique(session: Session, contexte: Contexte) -> PolitiqueMotDePasse:
    async with session.begin():
        longueur = await contexte.auth.politique_longueur_minimale(session)
    return PolitiqueMotDePasse(longueur_minimale=longueur)


@auth.get("/auth/me", summary="Lire le compte connecté")
async def moi(acces: Authentifie, session: Session, contexte: Contexte) -> UtilisateurReponse:
    return await contexte.utilisateurs.lire(session, acces.utilisateur_id)


@auth.get("/.well-known/jwks.json", summary="Lire les clés publiques des jetons agent")
async def cles_publiques(contexte: Contexte) -> JSONResponse:
    return JSONResponse(contexte.agent.cles_publiques(), headers={"Cache-Control": "max-age=300"})


@auth.get("/.well-known/oauth-protected-resource", summary="Métadonnées de la ressource protégée (RFC 9728)")
async def ressource_protegee(requete: Request) -> JSONResponse:
    return JSONResponse(
        {
            "resource": str(requete.base_url).rstrip("/"),
            "bearer_methods_supported": ["header"],
            "tls_client_certificate_bound_access_tokens": True,
        }
    )


@agent.post(
    "/auth/jetons/agent",
    summary="Obtenir un jeton délégué pour l'assistant IA",
)
async def jeton_agent(
    session: Session, contexte: Contexte, acces: Annotated[JetonAcces, Depends(exiger("IA_UTILISER"))]
) -> JSONResponse:
    jeton: JetonAgentReponse = await contexte.agent.emettre_jeton(session, acces.utilisateur_id)
    return JSONResponse(jeton.model_dump(by_alias=True), headers={"Cache-Control": "no-store"})


# --- /users ---------------------------------------------------------------------------------------

PaginationUtilisateurs = Annotated[
    Pagination, Depends(pagination("username", frozenset({"username", "email", "actif", "id"})))
]
PaginationRoles = Annotated[Pagination, Depends(pagination("nom", frozenset({"nom", "description", "id"})))]


@utilisateurs.post("/search", summary="Rechercher des utilisateurs")
async def rechercher_utilisateurs(
    session: Session,
    contexte: Contexte,
    pagination: PaginationUtilisateurs,
    criteres: UtilisateurRecherche | None = None,
) -> Page[UtilisateurReponse]:
    return await contexte.utilisateurs.rechercher(session, criteres, pagination)


@utilisateurs.get("/{identifiant}", summary="Lire un utilisateur")
async def lire_utilisateur(identifiant: int, session: Session, contexte: Contexte) -> UtilisateurReponse:
    return await contexte.utilisateurs.lire(session, identifiant)


@utilisateurs.post("", summary="Créer un utilisateur", status_code=status.HTTP_201_CREATED)
async def creer_utilisateur(
    corps: UtilisateurCreationRequete, session: Session, contexte: Contexte
) -> UtilisateurReponse:
    return await contexte.utilisateurs.creer(session, corps)


@utilisateurs.put("/{identifiant}", summary="Modifier un utilisateur")
async def modifier_utilisateur(
    identifiant: int, corps: UtilisateurModificationRequete, session: Session, contexte: Contexte
) -> UtilisateurReponse:
    return await contexte.utilisateurs.modifier(session, identifiant, corps)


@utilisateurs.put("/{identifiant}/permissions-refusees", summary="Définir les permissions refusées")
async def refuser_permissions(
    identifiant: int, corps: RefusPermissionsRequete, session: Session, contexte: Contexte
) -> UtilisateurReponse:
    return await contexte.utilisateurs.definir_permissions_refusees(session, identifiant, corps)


@utilisateurs.post(
    "/{identifiant}/reset-password",
    summary="Réinitialiser le mot de passe",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def reinitialiser_par_admin(
    identifiant: int, corps: ReinitialisationAdminRequete, session: Session, contexte: Contexte
) -> None:
    await contexte.utilisateurs.reinitialiser_mot_de_passe_par_admin(session, identifiant, corps)


# --- /roles et /permissions -----------------------------------------------------------------------

LECTURE = Depends(exiger("ROLE_MANAGE", "USER_MANAGE"))
ECRITURE = Depends(exiger("ROLE_MANAGE"))


@roles.post("/roles/search", summary="Rechercher des rôles", dependencies=[LECTURE])
async def rechercher_roles(
    session: Session, contexte: Contexte, pagination: PaginationRoles, criteres: RoleRecherche | None = None
) -> Page[RoleReponse]:
    return await contexte.roles.rechercher(session, criteres, pagination)


@roles.get("/roles/{identifiant}", summary="Lire un rôle", dependencies=[LECTURE])
async def lire_role(identifiant: int, session: Session, contexte: Contexte) -> RoleReponse:
    return await contexte.roles.lire(session, identifiant)


@roles.post("/roles", summary="Créer un rôle", status_code=status.HTTP_201_CREATED, dependencies=[ECRITURE])
async def creer_role(corps: RoleCreationRequete, session: Session, contexte: Contexte) -> RoleReponse:
    return await contexte.roles.creer(session, corps)


@roles.put("/roles/{identifiant}", summary="Modifier un rôle", dependencies=[ECRITURE])
async def modifier_role(
    identifiant: int, corps: RoleModificationRequete, session: Session, contexte: Contexte
) -> RoleReponse:
    return await contexte.roles.modifier(session, identifiant, corps)


@roles.delete(
    "/roles/{identifiant}",
    summary="Supprimer un rôle",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[ECRITURE],
)
async def supprimer_role(identifiant: int, session: Session, contexte: Contexte) -> None:
    await contexte.roles.supprimer(session, identifiant)


@roles.get("/permissions", summary="Lister le catalogue des permissions", dependencies=[LECTURE])
async def lister_permissions(session: Session, contexte: Contexte) -> list[PermissionReponse]:
    return await contexte.roles.lister_permissions(session)
