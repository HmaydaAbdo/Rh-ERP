# Les annotations d'Authlib sont partielles (types de retour des grants, JWT) : ces règles sont levées pour ce fichier.
# pyright: reportIncompatibleMethodOverride=false, reportUnknownMemberType=false, reportUnknownVariableType=false
# pyright: reportUnknownParameterType=false, reportUnknownLambdaType=false, reportUnknownArgumentType=false
"""Échange de jetons OAuth 2.0 (RFC 8693) : le jeton de connexion de l'utilisateur contre son jeton agent (KAN-74).

Le serveur est celui d'Authlib (``AuthorizationServer``, erreurs et réponses du RFC 6749) ; le jeton est un JWT d'accès
au profil RFC 9068 émis par ``JWTBearerTokenGenerator``. Authlib ne publie pas encore de grant RFC 8693 (son module
``rfc8693`` est vide) : ``GrantEchangeJeton`` est la seule classe écrite ici, à remplacer par l'officielle dès sa
parution (registre T26). Authlib est synchrone : la vérification du sujet et la lecture des droits en base, asynchrones,
sont faites avant (``ServiceAgent.echanger``) et passées à la requête.
"""

from dataclasses import dataclass
from typing import Any, cast

from authlib.oauth2.rfc6749 import AuthorizationServer, ClientMixin
from authlib.oauth2.rfc6749.errors import (
    InvalidGrantError,
    InvalidRequestError,
    InvalidScopeError,
    OAuth2Error,
)
from authlib.oauth2.rfc6749.grants import BaseGrant, TokenEndpointMixin
from authlib.oauth2.rfc6749.requests import BasicOAuth2Payload, OAuth2Request
from authlib.oauth2.rfc9068 import JWTBearerTokenGenerator
from starlette.responses import JSONResponse

from staport.domains.auth.securite import (
    AUDIENCE_IA,
    AUDIENCE_MCP,
    DUREE_JETON_AGENT,
    EMETTEUR,
    SCOPE_LECTURE,
    JeuDeCles,
)

TYPE_ECHANGE = "urn:ietf:params:oauth:grant-type:token-exchange"
TYPE_JETON_ACCES = "urn:ietf:params:oauth:token-type:access_token"
CLIENT_IA = "staport-ia"
#: Ressources que l'échange peut viser (paramètre ``audience``) : le serveur MCP de l'ERP.
AUDIENCES_ECHANGEABLES = frozenset({AUDIENCE_MCP})


class AccesRefuse(OAuth2Error):
    """Compte inactif ou droit `IA_UTILISER` retiré : 403, au lieu des 400 du RFC 6749 qui parlent de la requête."""

    error = "access_denied"
    status_code = 403
    description = "L'utilisateur n'a pas le droit d'utiliser l'assistant."


@dataclass(frozen=True)
class PreparationEchange:
    """Ce que l'API sait du sujet avant l'échange synchrone : identité active (ou motif de refus), pour le journal."""

    identifiant: int | None = None
    username: str | None = None
    refus: str | None = None
    sujet_valide: bool = False


class RequeteEchange(OAuth2Request):
    """Requête Authlib portant ce que l'API a vérifié (sujet, droits) avant l'échange synchrone."""

    preparation: PreparationEchange = PreparationEchange()


class UtilisateurAgent:
    """Le sujet du jeton : `sub` est le nom d'utilisateur, comme dans les autres jetons de l'application."""

    def __init__(self, identifiant: int, username: str, jti: str) -> None:
        self.identifiant = identifiant
        self.username = username
        self.jti = jti

    def get_user_id(self) -> str:
        return self.username


class ClientIa(ClientMixin):
    """Le service IA : client public (le jeton de connexion de l'utilisateur est la seule preuve, comme avant)."""

    def get_client_id(self) -> str:
        return CLIENT_IA

    def get_allowed_scope(self, scope: Any) -> str:
        demande = set((scope or SCOPE_LECTURE).split())
        if not demande <= {SCOPE_LECTURE}:
            raise InvalidScopeError()
        return SCOPE_LECTURE

    def check_endpoint_auth_method(self, method: str, endpoint: str) -> bool:
        return method == "none" and endpoint == "token"

    def check_grant_type(self, grant_type: str) -> bool:
        return grant_type == TYPE_ECHANGE


class GenerateurJetonAgent(JWTBearerTokenGenerator):
    """JWT d'accès RFC 9068 : identité seule, 5 minutes ; le client est noté comme acteur (`act`, RFC 8693)."""

    def __init__(self, cles: JeuDeCles) -> None:
        super().__init__(
            issuer=EMETTEUR, alg="RS256", expires_generator=lambda *_: int(DUREE_JETON_AGENT.total_seconds())
        )
        self._cles = cles

    def get_jwks(self) -> dict[str, Any]:
        return self._cles.cle_signature.as_dict(private=True)

    def get_audiences(self, client: ClientMixin, user: UtilisateurAgent, scope: str) -> list[str]:
        return [AUDIENCE_IA, AUDIENCE_MCP]

    def get_jti(self, client: ClientMixin, grant_type: str, user: UtilisateurAgent, scope: str) -> str:
        return user.jti

    def get_extra_claims(self, client: ClientMixin, grant_type: str, user: UtilisateurAgent, scope: str):
        return {"uid": user.identifiant, "act": {"sub": client.get_client_id()}}


class GrantEchangeJeton(BaseGrant, TokenEndpointMixin):
    """RFC 8693 § 2.1 : ``subject_token`` (jeton d'accès) contre un jeton d'accès pour l'audience demandée."""

    GRANT_TYPE = TYPE_ECHANGE
    TOKEN_ENDPOINT_AUTH_METHODS = ["none"]  # noqa: RUF012  # pyright: ignore[reportIncompatibleVariableOverride]

    def validate_token_request(self) -> None:
        requete = cast(RequeteEchange, self.request)
        client = self.authenticate_token_endpoint_client()
        if not client.check_grant_type(TYPE_ECHANGE):
            raise InvalidRequestError("Le client n'a pas le droit d'echanger des jetons.")
        donnees = cast(BasicOAuth2Payload, requete.payload).data
        if not donnees.get("subject_token"):
            raise InvalidRequestError("subject_token est obligatoire.")
        if donnees.get("subject_token_type") != TYPE_JETON_ACCES:
            raise InvalidRequestError("subject_token_type doit etre un jeton d'acces.")
        if donnees.get("requested_token_type", TYPE_JETON_ACCES) != TYPE_JETON_ACCES:
            raise InvalidRequestError("Seul un jeton d'acces peut etre demande.")
        if donnees.get("audience", AUDIENCE_MCP) not in AUDIENCES_ECHANGEABLES:
            raise InvalidRequestError("audience inconnue.")
        if donnees.get("actor_token"):
            raise InvalidRequestError("actor_token n'est pas pris en charge.")
        requete.client = client
        self.validate_requested_scope()
        preparation = requete.preparation
        if not preparation.sujet_valide:
            raise InvalidGrantError("Le jeton de connexion est invalide ou expire.")
        if preparation.refus is not None:
            raise AccesRefuse

    def create_token_response(self) -> Any:
        requete = cast(RequeteEchange, self.request)
        jeton = self.generate_token(user=requete.user, scope=requete.payload.scope, include_refresh_token=False)  # pyright: ignore[reportOptionalMemberAccess]
        jeton["issued_token_type"] = TYPE_JETON_ACCES
        return 200, jeton, [*self.TOKEN_RESPONSE_HEADER, ("Cache-Control", "no-store"), ("Pragma", "no-cache")]


class ServeurEchange(AuthorizationServer):
    """Serveur d'autorisation Authlib au service d'un seul point d'accès, ``POST /oauth/token``."""

    def __init__(self, cles: JeuDeCles) -> None:
        super().__init__(scopes_supported=[SCOPE_LECTURE])
        self._client = ClientIa()
        self.register_token_generator("default", GenerateurJetonAgent(cles))
        self.register_grant(GrantEchangeJeton)

    def query_client(self, client_id: str) -> Any:
        return self._client if client_id == CLIENT_IA else None

    def save_token(self, token: dict[str, Any], request: OAuth2Request) -> None:
        """Jeton court et sans état : rien à enregistrer, le journal d'audit garde son identifiant."""

    def send_signal(self, name: str, *args: Any, **kwargs: Any) -> None:
        """Pas de système de signaux."""

    def create_oauth2_request(self, request: OAuth2Request) -> OAuth2Request:
        return request

    def handle_response(self, status: int, body: Any, headers: Any) -> JSONResponse:
        return JSONResponse(body, status_code=status, headers=dict(headers))

    def echanger(
        self,
        url: str,
        formulaire: dict[str, str],
        preparation: PreparationEchange,
        jti: str,
    ) -> JSONResponse:
        """Traite une requête déjà lue ; la sécurité du transport est celle du déploiement (TLS en frontal), l'adresse
        est donc présentée en https à Authlib, qui refuse sinon toute requête non sécurisée."""
        requete = RequeteEchange("POST", url.replace("http://", "https://", 1), headers={})
        requete.payload = BasicOAuth2Payload(formulaire)
        requete.preparation = preparation
        if preparation.identifiant is not None and preparation.username is not None:
            requete.user = UtilisateurAgent(preparation.identifiant, preparation.username, jti)
        return cast(JSONResponse, self.create_token_response(requete))
