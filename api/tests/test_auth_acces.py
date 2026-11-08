"""Parité du domaine auth avec Spring (KAN-213) : chaîne de sécurité JWT, permissions par route, jeton agent, clés.

Reprend `JwtSecurityChainTest`, `EndpointSecurityTest`, `SecurityConfigCorsTest`, `AgentSigningKeysTest`,
`PolitiqueMotDePasseTest` et `EffectivePermissionResolverTest`, ainsi que la partie émission du jeton agent de
`McpSecuriteIntegrationTest` (le serveur MCP lui-même relève de KAN-216).
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

import asyncio
import base64
import hashlib
import hmac
import json
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from conftest import ORIGINE, Journal, Plateforme, construire_configuration, construire_contexte
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import text

from staport.domains.auth.composition import origines
from staport.domains.auth.mappage import noms_des_roles, permissions_effectives
from staport.domains.auth.models import Permission, Role, Utilisateur
from staport.domains.auth.securite import (
    EMETTEUR,
    ConfigurationCles,
    JeuDeCles,
    charger_cle_privee,
    verifier_jeton_agent,
)
from staport.domains.auth.service_auth import exiger_mot_de_passe_conforme
from staport.domains.common.securite import ActionSecurite as Action
from staport.main import creer_app
from staport.platform.erreurs import ErreurMetier

Fabrique = Callable[..., tuple[int, str]]


def _jeton(p: Plateforme, permissions: set[str] | None = None, roles: set[str] | None = None, uid: int = 1) -> str:
    return p.contexte.emetteur.emettre_acces(uid, "essai", permissions or set(), roles or set(), timedelta(minutes=5))


def _bearer(jeton: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {jeton}"}


def _cle_rsa(taille: int = 3072) -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=taille)


def _b64_prive(cle: rsa.RSAPrivateKey) -> str:
    der = cle.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    return base64.b64encode(der).decode("ascii")


def _b64_public(cle: rsa.RSAPrivateKey) -> str:
    der = cle.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return base64.b64encode(der).decode("ascii")


def _signer(
    p: Plateforme,
    cle: Any = None,
    algorithme: str = "RS256",
    kid: str | None = "cle-essai-1",
    **remplacements: Any,
) -> str:
    maintenant = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": "essai",
        "iss": EMETTEUR,
        "aud": EMETTEUR,
        "iat": maintenant,
        "exp": maintenant + timedelta(minutes=5),
        "uid": 1,
        "permissions": ["USER_MANAGE"],
        "roles": [],
    }
    claims.update(remplacements)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, cle or charger_cle_privee(p.cle_b64, "essai"), algorithm=algorithme, headers={"kid": kid})


# --- Chaîne de sécurité JWT -----------------------------------------------------------------------


def test_sans_jeton_la_requete_est_refusee_en_401_sans_corps(plateforme: Plateforme) -> None:
    reponse = plateforme.client.post("/users/search")
    assert reponse.status_code == 401 and reponse.content == b""
    assert reponse.headers["www-authenticate"] == (
        'Bearer resource_metadata="http://testserver/.well-known/oauth-protected-resource"'
    )
    assert plateforme.journal.de(None, Action.ACCES_ANONYME_REFUSE)[-1].motif == "HTTP_401"


def test_un_jeton_invalide_est_refuse_en_401(plateforme: Plateforme) -> None:
    reponse = plateforme.client.post("/users/search", headers=_bearer("pas.un.jeton"))
    assert reponse.status_code == 401 and 'error="invalid_token"' in reponse.headers["www-authenticate"]


VARIANTES_REFUSEES: dict[str, Callable[[Plateforme], str]] = {
    "signe-avec-une-autre-cle": lambda p: _signer(p, cle=_cle_rsa(2048)),
    "identifiant-de-cle-inconnu": lambda p: _signer(p, kid="cle-inconnue"),
    "autre-emetteur": lambda p: _signer(p, iss="autre-emetteur"),
    "autre-destinataire": lambda p: _signer(p, aud="autre-application"),
    "jeton-agent-non-accepte": lambda p: _signer(p, aud=["staport-intelligence-ia", "staport-intelligence-mcp"]),
    "expire": lambda p: _signer(p, exp=datetime.now(UTC) - timedelta(minutes=5)),
    "uid-non-numerique": lambda p: _signer(p, uid="12"),
    "sans-uid": lambda p: _signer(p, uid=None),
    "sans-sujet": lambda p: _signer(p, sub=" "),
}


@pytest.mark.parametrize("variante", VARIANTES_REFUSEES)
def test_un_jeton_qui_ne_respecte_pas_toutes_les_exigences_est_refuse_en_401(
    plateforme: Plateforme, variante: str
) -> None:
    jeton = VARIANTES_REFUSEES[variante](plateforme)
    assert plateforme.client.post("/users/search", headers=_bearer(jeton)).status_code == 401


def test_un_jeton_sans_expiration_est_refuse_en_401(plateforme: Plateforme) -> None:
    cle = charger_cle_privee(plateforme.cle_b64, "essai")
    maintenant = datetime.now(UTC)
    claims = {"sub": "essai", "iss": EMETTEUR, "aud": EMETTEUR, "iat": maintenant, "uid": 1}
    jeton = jwt.encode(claims, cle, algorithm="RS256", headers={"kid": "cle-essai-1"})
    assert plateforme.client.post("/users/search", headers=_bearer(jeton)).status_code == 401


def _segment(donnees: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(donnees).encode()).rstrip(b"=").decode()


def test_la_confusion_d_algorithme_est_refusee(plateforme: Plateforme) -> None:
    """Un jeton HS256 « signé » avec la clé publique, ou non signé, ne passe pas."""
    public = (
        charger_cle_privee(plateforme.cle_b64, "essai")
        .public_key()
        .public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    )
    maintenant = int(datetime.now(UTC).timestamp())
    claims = {
        "sub": "essai",
        "iss": EMETTEUR,
        "aud": EMETTEUR,
        "iat": maintenant,
        "exp": maintenant + 300,
        "uid": 1,
        "permissions": ["USER_MANAGE"],
    }
    corps = f"{_segment({'alg': 'HS256', 'typ': 'JWT', 'kid': 'cle-essai-1'})}.{_segment(claims)}"
    signature = hmac.new(public, corps.encode(), hashlib.sha256).digest()
    hs256 = f"{corps}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"
    sans_signature = f"{_segment({'alg': 'none', 'typ': 'JWT', 'kid': 'cle-essai-1'})}.{_segment(claims)}."
    for jeton in (hs256, sans_signature):
        assert plateforme.client.post("/users/search", headers=_bearer(jeton)).status_code == 401


def test_un_jeton_sans_la_permission_requise_est_refuse_en_403(plateforme: Plateforme) -> None:
    reponse = plateforme.client.post("/users/search", headers=_bearer(_jeton(plateforme, {"AUTRE_PERMISSION"})))
    assert reponse.status_code == 403
    assert reponse.json()["message"] == "Permission insuffisante pour effectuer cette action."
    assert plateforme.journal.de("essai", Action.ACCES_REFUSE)


def test_un_jeton_avec_la_permission_requise_est_accepte(plateforme: Plateforme) -> None:
    reponse = plateforme.client.post("/users/search", headers=_bearer(_jeton(plateforme, {"USER_MANAGE"})))
    assert reponse.status_code == 200


def test_un_role_du_jeton_est_une_autorite_mais_un_nom_quelconque_ne_donne_pas_acces(plateforme: Plateforme) -> None:
    autre = _jeton(plateforme, roles={"UN_ROLE_QUELCONQUE"})
    assert plateforme.client.post("/users/search", headers=_bearer(autre)).status_code == 403
    assert (
        plateforme.client.get("/auth/me", headers=_bearer(_jeton(plateforme, roles={"USER_MANAGE"}))).status_code != 401
    )


def test_une_page_est_serialisee_par_un_dto_stable(plateforme: Plateforme) -> None:
    corps = plateforme.client.post("/users/search", headers=_bearer(_jeton(plateforme, {"USER_MANAGE"}))).json()
    assert set(corps) == {"content", "page"}
    assert set(corps["page"]) == {"size", "number", "totalElements", "totalPages"}
    assert corps["page"]["size"] == 20 and corps["page"]["number"] == 0


def test_une_requete_mal_formee_est_une_erreur_du_client_pas_du_serveur(plateforme: Plateforme) -> None:
    entetes = {**_bearer(_jeton(plateforme, {"USER_MANAGE"})), "Content-Type": "application/json"}
    illisible = plateforme.client.post("/users/search", headers=entetes, content=b"{pas du json")
    assert illisible.status_code == 400 and illisible.json()["message"] == "Corps de la requête illisible."
    tri_inconnu = plateforme.client.post("/users/search?sort=mot_de_passe_hash,asc", headers=entetes)
    assert tri_inconnu.status_code == 400
    identifiant_texte = plateforme.client.get("/users/abc", headers=entetes)
    assert identifiant_texte.status_code == 400


# --- CORS et origine du rafraîchissement ----------------------------------------------------------


def test_le_prevol_depuis_une_origine_autorisee_retourne_les_entetes_cors(plateforme: Plateforme) -> None:
    reponse = plateforme.client.options(
        "/users/search",
        headers={
            "Origin": ORIGINE,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert reponse.status_code == 200
    assert reponse.headers["access-control-allow-origin"] == ORIGINE
    assert reponse.headers["access-control-allow-credentials"] == "true"
    assert "POST" in reponse.headers["access-control-allow-methods"]


def test_le_prevol_depuis_une_origine_non_autorisee_est_refuse(plateforme: Plateforme) -> None:
    reponse = plateforme.client.options(
        "/users/search", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"}
    )
    assert reponse.status_code in (400, 403) and "access-control-allow-origin" not in reponse.headers


def test_une_reponse_expose_l_identifiant_de_requete_a_l_origine_autorisee(plateforme: Plateforme) -> None:
    reponse = plateforme.client.get("/auth/password-policy", headers={"Origin": ORIGINE})
    assert reponse.headers["access-control-expose-headers"] == "X-Request-Id" and reponse.headers["x-request-id"]


def test_le_rafraichissement_par_cookie_refuse_une_origine_non_autorisee_ou_absente(plateforme: Plateforme) -> None:
    plateforme.client.cookies.set("refresh_token", "x", path="/auth")
    sans_origine = plateforme.client.post("/auth/refresh")
    mauvaise = plateforme.client.post("/auth/refresh", headers={"Origin": "http://evil.example"})
    assert sans_origine.status_code == 401 and sans_origine.content == b""
    assert mauvaise.status_code == 403 and mauvaise.text == "Invalid CORS request"  # `DefaultCorsProcessor` de Spring


def test_le_rafraichissement_accepte_une_origine_autorisee_jusqu_a_la_resolution_du_controleur(
    plateforme: Plateforme,
) -> None:
    reponse = plateforme.client.post("/auth/refresh", headers={"Origin": ORIGINE})
    assert reponse.status_code == 401 and reponse.json()["message"].startswith("Refresh token invalide")


@pytest.mark.parametrize(
    ("valeur", "attendu"),
    [
        ("http://localhost:5002", {"http://localhost:5002"}),
        (" https://a.example , http://b.example:8080 ", {"https://a.example", "http://b.example:8080"}),
    ],
)
def test_les_origines_declarees_sont_conservees_sans_joker(valeur: str, attendu: set[str]) -> None:
    assert origines(valeur) == attendu


@pytest.mark.parametrize(
    "valeur",
    [
        "",
        "   ",
        "http://a.example,",
        "*",
        "https://*.example",
        "ftp://a.example",
        "a.example",
        "http://a.example/chemin",
    ],
)
def test_une_origine_non_conforme_ou_vide_est_refusee(valeur: str) -> None:
    with pytest.raises(ValueError, match="CORS"):
        origines(valeur)


# --- Une permission explicite par route -----------------------------------------------------------

PUBLIQUES = {
    ("POST", "/auth/login"),
    ("POST", "/auth/refresh"),
    ("POST", "/auth/forgot-password"),
    ("POST", "/auth/reset-password"),
    ("GET", "/auth/password-policy"),
    ("GET", "/.well-known/jwks.json"),
    ("GET", "/.well-known/oauth-protected-resource"),
}
AUTHENTIFIEES = {("POST", "/auth/logout"), ("GET", "/auth/me")}
EXIGENCES: dict[tuple[str, str], set[str]] = {
    ("POST", "/auth/jetons/agent"): {"IA_UTILISER"},
    ("POST", "/users/search"): {"USER_MANAGE"},
    ("GET", "/users/{identifiant}"): {"USER_MANAGE"},
    ("POST", "/users"): {"USER_MANAGE"},
    ("PUT", "/users/{identifiant}"): {"USER_MANAGE"},
    ("PUT", "/users/{identifiant}/permissions-refusees"): {"USER_MANAGE"},
    ("POST", "/users/{identifiant}/reset-password"): {"USER_MANAGE"},
    ("POST", "/roles/search"): {"ROLE_MANAGE", "USER_MANAGE"},
    ("GET", "/roles/{identifiant}"): {"ROLE_MANAGE", "USER_MANAGE"},
    ("GET", "/permissions"): {"ROLE_MANAGE", "USER_MANAGE"},
    ("POST", "/roles"): {"ROLE_MANAGE"},
    ("PUT", "/roles/{identifiant}"): {"ROLE_MANAGE"},
    ("DELETE", "/roles/{identifiant}"): {"ROLE_MANAGE"},
    ("GET", "/accueil"): {"ACCUEIL_READ"},
    ("PUT", "/accueil"): {"ACCUEIL_WRITE"},
    ("DELETE", "/accueil"): {"ACCUEIL_WRITE"},
    ("GET", "/accueil/utilisateurs/{identifiant}"): {"ACCUEIL_ADMIN"},
    ("PUT", "/accueil/utilisateurs/{identifiant}"): {"ACCUEIL_ADMIN"},
    ("DELETE", "/accueil/utilisateurs/{identifiant}"): {"ACCUEIL_ADMIN"},
    ("POST", "/functions"): {"FUNCTION_WRITE"},
    ("PUT", "/functions/{identifiant}"): {"FUNCTION_WRITE"},
    ("GET", "/functions/{identifiant}"): {"FUNCTION_READ"},
    ("POST", "/functions/search"): {"FUNCTION_READ"},
    ("DELETE", "/functions/{identifiant}"): {"FUNCTION_DELETE"},
    ("POST", "/functions/import"): {"FUNCTION_IMPORT"},
    ("GET", "/functions/import/modele"): {"FUNCTION_IMPORT"},
    ("POST", "/equipes"): {"EQUIPE_WRITE"},
    ("PUT", "/equipes/{identifiant}"): {"EQUIPE_WRITE"},
    ("GET", "/equipes/{identifiant}"): {"EQUIPE_READ"},
    ("POST", "/equipes/search"): {"EQUIPE_READ"},
    ("DELETE", "/equipes/{identifiant}"): {"EQUIPE_DELETE"},
    ("POST", "/equipes/import"): {"EQUIPE_IMPORT"},
    ("GET", "/equipes/import/modele"): {"EQUIPE_IMPORT"},
    ("POST", "/chantiers"): {"CHANTIER_WRITE"},
    ("PUT", "/chantiers/{identifiant}"): {"CHANTIER_WRITE"},
    ("PUT", "/chantiers/{identifiant}/statut"): {"CHANTIER_WRITE"},
    ("GET", "/chantiers/{identifiant}"): {"CHANTIER_READ"},
    ("GET", "/chantiers/carte"): {"CARTE_READ"},
    ("POST", "/chantiers/search"): {"CHANTIER_READ"},
    ("DELETE", "/chantiers/{identifiant}"): {"CHANTIER_DELETE"},
    ("POST", "/chantiers/sync"): {"CHANTIER_SYNC"},
    ("POST", "/employees"): {"EMPLOYEE_WRITE"},
    ("PUT", "/employees/{identifiant}"): {"EMPLOYEE_WRITE"},
    ("GET", "/employees/{identifiant}"): {"EMPLOYEE_READ"},
    ("POST", "/employees/search"): {"EMPLOYEE_READ"},
    ("DELETE", "/employees/{identifiant}"): {"EMPLOYEE_DELETE"},
    ("POST", "/employees/analytique"): {"EMPLOYEE_READ"},
    ("POST", "/employees/regroupements"): {"EMPLOYEE_READ"},
    ("POST", "/employees/sorties-mois"): {"EMPLOYEE_READ"},
    ("GET", "/employees/import/modele"): {"EMPLOYEE_IMPORT"},
    ("POST", "/employees/import"): {"EMPLOYEE_IMPORT"},
    ("GET", "/paie/{identifiant}"): {"PAIE_READ"},
    ("POST", "/paie/search"): {"PAIE_READ"},
    ("GET", "/paie/periodes"): {"PAIE_READ"},
    ("POST", "/paie/periodes/search"): {"PAIE_READ"},
    ("POST", "/paie/chantiers/search"): {"PAIE_READ"},
    ("GET", "/paie/chantiers"): {"PAIE_READ"},
    ("GET", "/paie/materiel"): {"PAIE_READ"},
    ("GET", "/paie/materiel/valeurs"): {"PAIE_EXPORT"},
    ("POST", "/paie/analytique"): {"PAIE_READ"},
    ("POST", "/paie/options/chantiers"): {"PAIE_READ"},
    ("POST", "/paie/options/equipes"): {"PAIE_READ"},
    ("POST", "/paie/effectifs"): {"PAIE_READ"},
    ("GET", "/paie/employes/{id}/parcours"): {"PAIE_READ"},
    ("POST", "/paie/export"): {"PAIE_EXPORT"},
    ("POST", "/paie/report/pdf"): {"PAIE_EXPORT"},
    ("GET", "/paie/import/modele"): {"PAIE_IMPORT"},
    ("POST", "/paie/import"): {"PAIE_IMPORT"},
    ("DELETE", "/paie/{identifiant}"): {"PAIE_DELETE"},
    ("POST", "/paie/suppression"): {"PAIE_PURGE"},
    ("POST", "/paie/restauration/{identifiant_entree}"): {"PAIE_RESTORE"},
}
REQUIS_CUMULATIFS: dict[tuple[str, str], set[str]] = {
    ("POST", "/heures-supp/search"): {"HEURES_SUP_READ", "PAIE_READ"},
    ("GET", "/heures-supp/periodes"): {"HEURES_SUP_READ", "PAIE_READ"},
    ("GET", "/heures-supp/{identifiant}"): {"HEURES_SUP_READ", "PAIE_READ"},
    ("POST", "/heures-supp/analytique"): {"HEURES_SUP_READ", "PAIE_READ"},
    ("POST", "/heures-supp/export/pdf"): {"HEURES_SUP_READ", "PAIE_READ"},
    ("PUT", "/heures-supp/{identifiant}"): {"HEURES_SUP_IMPORT", "PAIE_READ"},
    ("POST", "/heures-supp"): {"HEURES_SUP_IMPORT", "PAIE_READ", "EMPLOYEE_READ", "CHANTIER_READ"},
    ("DELETE", "/heures-supp/{identifiant}"): {"HEURES_SUP_DELETE", "PAIE_READ"},
    ("GET", "/heures-supp/import/prerequis"): {"HEURES_SUP_IMPORT", "PAIE_READ", "CHANTIER_READ"},
    ("POST", "/heures-supp/import/analyse"): {"HEURES_SUP_IMPORT", "PAIE_READ", "EMPLOYEE_READ"},
    ("POST", "/heures-supp/import/corrections"): {
        "HEURES_SUP_IMPORT",
        "PAIE_READ",
        "EMPLOYEE_WRITE",
        "FUNCTION_READ",
    },
    ("POST", "/heures-supp/import"): {"HEURES_SUP_IMPORT", "PAIE_READ", "EMPLOYEE_READ"},
    ("POST", "/heures-supp/import/remplacement"): {"HEURES_SUP_IMPORT", "PAIE_READ", "EMPLOYEE_READ"},
    ("GET", "/heures-supp/import/modele"): {"HEURES_SUP_IMPORT", "PAIE_READ"},
    ("POST", "/heures-supp/suppression-mois"): {"HEURES_SUP_PURGE", "PAIE_READ"},
    ("POST", "/paie"): {"PAIE_WRITE", "EMPLOYEE_WRITE"},
    ("PUT", "/paie/{identifiant}"): {"PAIE_WRITE", "EMPLOYEE_WRITE"},
    ("POST", "/paie/import/analyse"): {"PAIE_IMPORT", "PAIE_READ"},
    ("POST", "/paie/import/corrections"): {"PAIE_IMPORT", "PAIE_READ", "EMPLOYEE_WRITE"},
}


def _routes(p: Plateforme) -> set[tuple[str, str]]:
    """Routes réellement montées, lues dans le schéma OpenAPI (API publique de FastAPI)."""
    return {
        (methode.upper(), chemin)
        for chemin, operations in p.app.openapi()["paths"].items()
        if not chemin.startswith(("/logs", "/parametres"))  # autres domaines : test_audit_consultation, test_parametre
        for methode in operations
    }


def test_les_routes_des_domaines_sont_decouvertes_et_chacune_declare_son_acces(plateforme: Plateforme) -> None:
    declarees = PUBLIQUES | AUTHENTIFIEES | set(EXIGENCES) | set(REQUIS_CUMULATIFS)
    assert len(declarees) == 99
    assert _routes(plateforme) == declarees  # une route ajoutée sans exigence déclarée fait échouer ce test


def test_les_autorites_exigees_correspondent_a_la_table_de_reference(plateforme: Plateforme) -> None:
    exigees = set().union(*EXIGENCES.values(), *REQUIS_CUMULATIFS.values())
    with plateforme.moteur.connect() as c:
        connues = set(c.execute(text("SELECT code FROM permission")).scalars())
    assert exigees <= connues


def _appeler(p: Plateforme, methode: str, chemin: str, jeton: str) -> int:
    url = chemin.replace("{identifiant}", "999999999")
    return p.client.request(methode, url, headers=_bearer(jeton), json={}).status_code


def test_chaque_route_refuse_une_identite_sans_l_autorite_exigee(plateforme: Plateforme) -> None:
    sans_droit = _jeton(plateforme, {"AUCUN_DROIT"})
    for (methode, chemin), _exigees in (EXIGENCES | REQUIS_CUMULATIFS).items():
        assert _appeler(plateforme, methode, chemin, sans_droit) == 403, (methode, chemin)


def test_chaque_route_accepte_chacune_des_autorites_alternatives(plateforme: Plateforme) -> None:
    for (methode, chemin), exigees in EXIGENCES.items():
        for autorite in exigees:
            statut = _appeler(plateforme, methode, chemin, _jeton(plateforme, {autorite}))
            assert statut not in (401, 403), (methode, chemin, autorite, statut)


def test_import_paie_exige_les_permissions_cumulatives(plateforme: Plateforme) -> None:
    for (methode, chemin), droits in REQUIS_CUMULATIFS.items():
        assert _appeler(plateforme, methode, chemin, _jeton(plateforme, droits)) not in (401, 403)
        for droit in droits:
            assert _appeler(plateforme, methode, chemin, _jeton(plateforme, {droit})) == 403


def test_une_autre_permission_du_meme_domaine_ne_donne_pas_acces(plateforme: Plateforme) -> None:
    gestion_roles_seule = _jeton(plateforme, {"ROLE_MANAGE"})
    assert _appeler(plateforme, "POST", "/users/search", gestion_roles_seule) == 403
    gestion_comptes_seule = _jeton(plateforme, {"USER_MANAGE"})
    assert _appeler(plateforme, "POST", "/roles", gestion_comptes_seule) == 403
    assert _appeler(plateforme, "GET", "/permissions", gestion_comptes_seule) == 200


def test_les_routes_publiques_et_authentifiees(plateforme: Plateforme) -> None:
    assert plateforme.client.get("/auth/password-policy").status_code == 200
    assert plateforme.client.get("/.well-known/jwks.json").status_code == 200
    assert plateforme.client.get("/auth/me").status_code == 401
    assert plateforme.client.post("/auth/logout").status_code == 401
    # /auth/me : compte inexistant derrière un jeton valide
    assert plateforme.client.get("/auth/me", headers=_bearer(_jeton(plateforme, uid=999999999))).status_code == 404


# --- Jeton délégué de l'agent IA ------------------------------------------------------------------


def test_le_jeton_agent_porte_l_identite_seule_pendant_cinq_minutes(
    plateforme: Plateforme, creer_utilisateur: Fabrique, connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    identifiant, mdp = creer_utilisateur("agent", roles=("SYSTEM_ADMIN",))
    with plateforme.moteur.connect() as c:
        nom = c.execute(text("SELECT username FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
    acces = connecter(nom, mdp)["accessToken"]
    reponse = plateforme.client.post("/auth/jetons/agent", headers=_bearer(acces))
    assert reponse.status_code == 200 and reponse.headers["cache-control"] == "no-store"
    corps = reponse.json()
    assert corps["typeJeton"] == "Bearer" and corps["expireDansSecondes"] == 300
    entete = jwt.get_unverified_header(corps["jeton"])
    assert entete["alg"] == "RS256" and entete["kid"] == "cle-essai-1" and entete["typ"] == "JWT"
    claims = jwt.decode(corps["jeton"], options={"verify_signature": False})
    assert claims["iss"] == EMETTEUR and claims["sub"] == nom and claims["uid"] == identifiant
    assert (
        set(claims["aud"]) == {"staport-intelligence-ia", "staport-intelligence-mcp"}
        and claims["scope"] == "mcp:lecture"
    )
    assert claims["exp"] - claims["iat"] == 300 and claims["jti"] and claims["nbf"] == claims["iat"]
    assert "permissions" not in claims and "roles" not in claims
    cles = JeuDeCles.depuis_configuration(plateforme.cle_b64, "cle-essai-1", "", "", "MCP_JWT")
    assert verifier_jeton_agent(cles, corps["jeton"]) == (identifiant, nom, "mcp:lecture")
    emis = plateforme.journal.de(nom, Action.JETON_AGENT_EMIS)[0]
    assert emis.details["jti"] == claims["jti"] and corps["jeton"] not in str(emis)


def test_le_jeton_agent_est_refuse_si_le_droit_est_retire_ou_le_compte_desactive(
    plateforme: Plateforme, creer_utilisateur: Fabrique
) -> None:
    identifiant, _ = creer_utilisateur("retire")
    # Jeton d'accès encore valide qui affiche IA_UTILISER, mais le compte ne l'a plus en base.
    acces = plateforme.contexte.emetteur.emettre_acces(
        identifiant, "retire", {"IA_UTILISER"}, set(), timedelta(minutes=5)
    )
    reponse = plateforme.client.post("/auth/jetons/agent", headers=_bearer(acces))
    assert reponse.status_code == 403
    assert plateforme.journal.de(None, Action.JETON_AGENT_REFUSE)[-1].motif == "DROIT_IA_RETIRE"
    with plateforme.moteur.begin() as c:
        c.execute(text("UPDATE utilisateur SET actif = false WHERE id = :i"), {"i": identifiant})
    assert plateforme.client.post("/auth/jetons/agent", headers=_bearer(acces)).status_code == 403
    assert plateforme.journal.de(None, Action.JETON_AGENT_REFUSE)[-1].motif == "COMPTE_INACTIF"


def test_le_jwks_publie_la_cle_publique_sans_partie_privee(plateforme: Plateforme) -> None:
    reponse = plateforme.client.get("/.well-known/jwks.json")
    assert reponse.status_code == 200 and reponse.headers["cache-control"] == "max-age=300"
    cles = reponse.json()["keys"]
    assert len(cles) == 1
    assert cles[0]["kid"] == "cle-essai-1" and cles[0]["alg"] == "RS256" and cles[0]["use"] == "sig"
    assert cles[0]["kty"] == "RSA" and not ({"d", "p", "q", "dp", "dq", "qi"} & set(cles[0]))


@pytest.fixture
def plateforme_sans_ia(plateforme: Plateforme) -> Iterator[Plateforme]:
    configuration = construire_configuration(plateforme.url, plateforme.cle_b64, mcp_enabled=False)
    journal = Journal()
    contexte = construire_contexte(configuration, journal)
    app = creer_app(configuration, contexte=contexte, amorcer_admin=False)
    with TestClient(
        app, raise_server_exceptions=False, backend_options={"loop_factory": asyncio.SelectorEventLoop}
    ) as c:
        yield Plateforme(
            app, c, contexte, configuration, plateforme.moteur, journal, plateforme.url, plateforme.cle_b64
        )


def test_l_assistant_ia_desactive_repond_404(plateforme_sans_ia: Plateforme) -> None:
    p = plateforme_sans_ia
    assert p.client.get("/.well-known/jwks.json").status_code == 404
    assert p.client.get("/.well-known/jwks.json").json()["message"] == "L'assistant IA n'est pas activé"
    acces = _jeton(p, {"IA_UTILISER"})
    assert p.client.post("/auth/jetons/agent", headers=_bearer(acces)).status_code == 404


# --- Jeu de clés ----------------------------------------------------------------------------------


def test_la_cle_privee_et_son_identifiant_sont_obligatoires() -> None:
    cle = _b64_prive(_cle_rsa())
    with pytest.raises(ConfigurationCles, match="PRIVATE_KEY est obligatoire"):
        JeuDeCles.depuis_configuration("", "kid", "", "", "MCP_JWT")
    with pytest.raises(ConfigurationCles, match="KEY_ID est obligatoire"):
        JeuDeCles.depuis_configuration(cle, "  ", "", "", "MCP_JWT")


def test_une_cle_de_moins_de_3072_bits_est_refusee() -> None:
    with pytest.raises(ConfigurationCles, match="3072 bits"):
        JeuDeCles.depuis_configuration(_b64_prive(_cle_rsa(2048)), "kid", "", "", "MCP_JWT")


def test_une_cle_illisible_est_refusee_sans_reprendre_son_contenu() -> None:
    secret = base64.b64encode(b"ce-n-est-pas-une-cle-du-tout").decode()
    with pytest.raises(ConfigurationCles) as erreur:
        JeuDeCles.depuis_configuration(secret, "kid", "", "", "MCP_JWT")
    assert secret not in str(erreur.value) and "PKCS#8" in str(erreur.value)
    with pytest.raises(ConfigurationCles, match="base64"):
        JeuDeCles.depuis_configuration("%%%pas-du-base64%%%", "kid", "", "", "MCP_JWT")


def test_la_cle_precedente_exige_un_identifiant_distinct_et_est_publiee() -> None:
    courante, precedente = _cle_rsa(), _cle_rsa()
    with pytest.raises(ConfigurationCles, match="PREVIOUS_KEY_ID est obligatoire"):
        JeuDeCles.depuis_configuration(_b64_prive(courante), "k2", _b64_public(precedente), "", "MCP_JWT")
    with pytest.raises(ConfigurationCles, match="doit différer"):
        JeuDeCles.depuis_configuration(_b64_prive(courante), "k2", _b64_public(precedente), "k2", "MCP_JWT")
    cles = JeuDeCles.depuis_configuration(_b64_prive(courante), "k2", _b64_public(precedente), "k1", "MCP_JWT")
    assert [k["kid"] for k in cles.jwks()["keys"]] == ["k2", "k1"]
    assert cles.cle_publique("k1") is not None and cles.cle_publique("k3") is None


# --- Règle des mots de passe ----------------------------------------------------------------------


def test_un_mot_de_passe_conforme_est_accepte_sans_composition_imposee() -> None:
    exiger_mot_de_passe_conforme("abcdefghij", "alice", 10)
    exiger_mot_de_passe_conforme("          ", "alice", 10)  # aucune règle de composition


@pytest.mark.parametrize(("mot_de_passe", "identifiant"), [("court", "alice"), ("Alice-Dupont", "alice-dupont")])
def test_trop_court_ou_egal_a_l_identifiant_est_refuse(mot_de_passe: str, identifiant: str) -> None:
    with pytest.raises(ErreurMetier):
        exiger_mot_de_passe_conforme(mot_de_passe, identifiant, 10)


def test_le_message_rappelle_la_regle_sans_jamais_contenir_la_valeur_saisie() -> None:
    with pytest.raises(ErreurMetier) as erreur:
        exiger_mot_de_passe_conforme("secret-trop", "secret-trop", 12)
    assert str(erreur.value) == "Mot de passe non conforme : 12 caractères minimum et différent de l'identifiant."
    assert "secret-trop" not in str(erreur.value)


# --- Permissions effectives -----------------------------------------------------------------------


def _utilisateur(roles: dict[str, set[str]], refusees: set[str] = frozenset()) -> Utilisateur:  # pyright: ignore[reportArgumentType]
    utilisateur = Utilisateur(username="u", email="u@example.org", mot_de_passe_hash="x")
    utilisateur.roles = set()
    for nom, codes in roles.items():
        role = Role(nom=nom)
        role.permissions = {Permission(code=c, description=c) for c in codes}
        utilisateur.roles.add(role)
    utilisateur.permissions_refusees = {Permission(code=c, description=c) for c in refusees}
    return utilisateur


def test_les_permissions_de_tous_les_roles_sont_reunies() -> None:
    u = _utilisateur({"A": {"X", "Y"}, "B": {"Y", "Z"}})
    assert permissions_effectives(u) == {"X", "Y", "Z"}


def test_le_refus_individuel_l_emporte_sur_la_permission_du_role() -> None:
    u = _utilisateur({"A": {"X", "Y"}, "B": {"Y"}}, refusees={"Y"})
    assert permissions_effectives(u) == {"X"}


def test_sans_role_aucune_permission_et_les_noms_de_roles_sont_listes() -> None:
    assert permissions_effectives(_utilisateur({})) == set()
    assert noms_des_roles(_utilisateur({"A": set(), "B": {"X"}})) == {"A", "B"}
