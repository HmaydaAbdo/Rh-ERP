"""Mécanismes de sécurité du domaine auth : mots de passe, jetons opaques, clés et jetons JWT RS256 (ADR 0016 § 4).

- Mots de passe : `pwdlib`, Argon2 pour tout nouveau hachage ; les empreintes BCrypt de Spring sont vérifiées puis
  remplacées à la première connexion réussie (`verifier_et_mettre_a_jour`). Le hachage, coûteux par conception, tourne
  hors de la boucle d'événements.
- Jetons opaques (rafraîchissement, réinitialisation) : 256 bits aléatoires, seule leur empreinte SHA-256 est stockée.
- JWT : RS256 uniquement ; la clé privée ne quitte pas le serveur, la clé publique peut être publiée.
"""

import asyncio
import base64
import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey
from jwt.algorithms import RSAAlgorithm
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

EMETTEUR = "erp-rh"
AUDIENCE_IA = "erp-rh-ia"
AUDIENCE_MCP = "erp-rh-mcp"
SCOPE_LECTURE = "mcp:lecture"
PERMISSION_IA = "IA_UTILISER"
DUREE_JETON_AGENT = timedelta(minutes=5)
TAILLE_CLE_MINIMALE = 3072
TOLERANCE_HORLOGE = 60  # secondes, comme le décodeur JWT de Spring Security


class ConfigurationCles(ValueError):
    """Variable de clé absente ou invalide : le démarrage échoue plutôt que d'accepter une clé faible."""


# --- Mots de passe --------------------------------------------------------------------------------


class Hacheur:
    """Hachage des mots de passe (Argon2 courant, BCrypt de Spring accepté en lecture)."""

    def __init__(self) -> None:
        self._hash = PasswordHash((Argon2Hasher(), BcryptHasher()))
        # Empreinte d'un mot de passe que personne ne connaît : comparée quand le compte n'existe pas, pour que la durée
        # de la réponse ne révèle pas l'absence d'un identifiant.
        self.empreinte_factice = self._hash.hash(str(uuid.uuid4()))

    def hacher_sync(self, mot_de_passe: str) -> str:
        return self._hash.hash(mot_de_passe)

    def verifier_sync(self, mot_de_passe: str, empreinte: str) -> tuple[bool, str | None]:
        try:
            return self._hash.verify_and_update(mot_de_passe, empreinte)
        except ValueError:  # BCrypt refuse un mot de passe de plus de 72 octets : ce n'est pas le bon mot de passe
            return False, None

    async def hacher(self, mot_de_passe: str) -> str:
        return await asyncio.to_thread(self.hacher_sync, mot_de_passe)

    async def verifier_et_mettre_a_jour(self, mot_de_passe: str, empreinte: str) -> tuple[bool, str | None]:
        """`(valide, nouvelle_empreinte)` ; la nouvelle empreinte est fournie quand l'ancienne doit être remplacée."""
        return await asyncio.to_thread(self.verifier_sync, mot_de_passe, empreinte)


# --- Jetons opaques -------------------------------------------------------------------------------


def generer_jeton_brut() -> str:
    return secrets.token_urlsafe(32)


def hasher_jeton(jeton_brut: str) -> str:
    """SHA-256 puis Base64 standard : même empreinte que `TokenHasher` de Spring (jetons existants valides)."""
    return base64.b64encode(hashlib.sha256(jeton_brut.encode("utf-8")).digest()).decode("ascii")


# --- Clés RSA -------------------------------------------------------------------------------------


def _decoder_base64(valeur: str, variable: str) -> bytes:
    try:
        return base64.b64decode("".join(valeur.split()), validate=True)
    except ValueError as cause:
        raise ConfigurationCles(f"{variable} n'est pas du base64 valide") from cause


def _verifier_taille(cle: RSAPublicKey, variable: str) -> None:
    if cle.key_size < TAILLE_CLE_MINIMALE:
        raise ConfigurationCles(f"{variable} : clé RSA de {TAILLE_CLE_MINIMALE} bits au moins exigée")


def charger_cle_privee(base64_pkcs8: str, variable: str) -> RSAPrivateKey:
    der = _decoder_base64(base64_pkcs8, variable)
    try:
        cle = serialization.load_der_private_key(der, password=None)
    except ValueError as cause:
        raise ConfigurationCles(f"{variable} n'est pas une clé privée RSA PKCS#8 valide") from cause
    if not isinstance(cle, RSAPrivateKey):
        raise ConfigurationCles(f"{variable} n'est pas une clé privée RSA PKCS#8 valide")
    _verifier_taille(cle.public_key(), variable)
    return cle


def charger_cle_publique(base64_x509: str, variable: str) -> RSAPublicKey:
    der = _decoder_base64(base64_x509, variable)
    try:
        cle = serialization.load_der_public_key(der)
    except ValueError as cause:
        raise ConfigurationCles(f"{variable} n'est pas une clé publique RSA X.509 valide") from cause
    if not isinstance(cle, RSAPublicKey):
        raise ConfigurationCles(f"{variable} n'est pas une clé publique RSA X.509 valide")
    _verifier_taille(cle, variable)
    return cle


def _jwk(cle: RSAPublicKey, identifiant: str) -> dict[str, Any]:
    jwk: dict[str, Any] = RSAAlgorithm.to_jwk(cle, as_dict=True)  # pyright: ignore[reportAssignmentType,reportCallIssue]
    jwk.update({"kid": identifiant, "use": "sig", "alg": "RS256"})
    return jwk


@dataclass(frozen=True)
class JeuDeCles:
    """Clé courante (signature et vérification) et, pendant une rotation, clé publique précédente (vérification)."""

    identifiant: str
    privee: RSAPrivateKey
    precedente: RSAPublicKey | None = None
    identifiant_precedent: str | None = None

    @classmethod
    def depuis_configuration(
        cls, privee_b64: str, identifiant: str, precedente_b64: str, identifiant_precedent: str, prefixe: str
    ) -> JeuDeCles:
        if not privee_b64.strip():
            raise ConfigurationCles(f"{prefixe}_PRIVATE_KEY est obligatoire")
        if not identifiant.strip():
            raise ConfigurationCles(f"{prefixe}_KEY_ID est obligatoire")
        privee = charger_cle_privee(privee_b64, f"{prefixe}_PRIVATE_KEY")
        if not precedente_b64.strip():
            return cls(identifiant.strip(), privee)
        if not identifiant_precedent.strip():
            raise ConfigurationCles(f"{prefixe}_PREVIOUS_KEY_ID est obligatoire avec une clé précédente")
        if identifiant_precedent.strip() == identifiant.strip():
            raise ConfigurationCles(f"{prefixe}_PREVIOUS_KEY_ID doit différer de {prefixe}_KEY_ID")
        return cls(
            identifiant.strip(),
            privee,
            charger_cle_publique(precedente_b64, f"{prefixe}_PREVIOUS_PUBLIC_KEY"),
            identifiant_precedent.strip(),
        )

    def cle_publique(self, identifiant: str | None) -> RSAPublicKey | None:
        if identifiant == self.identifiant:
            return self.privee.public_key()
        if self.precedente is not None and identifiant == self.identifiant_precedent:
            return self.precedente
        return None

    def jwks(self) -> dict[str, Any]:
        """Clés publiques (courante puis précédente), sans partie privée."""
        cles = [_jwk(self.privee.public_key(), self.identifiant)]
        if self.precedente is not None and self.identifiant_precedent is not None:
            cles.append(_jwk(self.precedente, self.identifiant_precedent))
        return {"keys": cles}


# --- Jetons JWT -----------------------------------------------------------------------------------


@dataclass(frozen=True)
class JetonAcces:
    utilisateur_id: int
    username: str
    permissions: frozenset[str]
    roles: frozenset[str]


class JetonInvalide(Exception):
    """Jeton absent de garanties : signature, algorithme, émetteur, destinataire, échéance ou claims requis."""


class EmetteurJetons:
    """Émission et vérification des jetons d'accès utilisateur (RS256, audience = l'application)."""

    def __init__(self, cles: JeuDeCles) -> None:
        self._cles = cles

    def emettre_acces(
        self, utilisateur_id: int, username: str, permissions: set[str], roles: set[str], duree: timedelta
    ) -> str:
        maintenant = datetime.now(UTC)
        claims: dict[str, Any] = {
            "sub": username,
            "iss": EMETTEUR,
            "aud": EMETTEUR,
            "iat": maintenant,
            "exp": maintenant + duree,
            "uid": utilisateur_id,
            "permissions": sorted(permissions),
            "roles": sorted(roles),
        }
        return jwt.encode(claims, self._cles.privee, algorithm="RS256", headers={"kid": self._cles.identifiant})

    def verifier_acces(self, jeton: str) -> JetonAcces:
        claims = _decoder(jeton, self._cles, audience=EMETTEUR)
        uid = claims.get("uid")
        if isinstance(uid, bool) or not isinstance(uid, int):
            raise JetonInvalide("claim uid absent")
        return JetonAcces(
            utilisateur_id=uid,
            username=claims["sub"],
            permissions=frozenset(claims.get("permissions") or ()),
            roles=frozenset(claims.get("roles") or ()),
        )


def _decoder(jeton: str, cles: JeuDeCles, audience: str) -> dict[str, Any]:
    try:
        cle = cles.cle_publique(jwt.get_unverified_header(jeton).get("kid"))
        if cle is None:
            raise JetonInvalide("clé inconnue")
        claims: dict[str, Any] = jwt.decode(
            jeton,
            cle,
            algorithms=["RS256"],
            audience=audience,
            issuer=EMETTEUR,
            leeway=TOLERANCE_HORLOGE,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as cause:
        raise JetonInvalide(str(cause)) from cause
    if not isinstance(claims.get("sub"), str) or not claims["sub"].strip():
        raise JetonInvalide("sujet absent")
    return claims


def emettre_jeton_agent(cles: JeuDeCles, utilisateur_id: int, username: str) -> tuple[str, str]:
    """Jeton délégué de l'assistant IA : identité seule, 5 minutes. Retourne `(jeton, jti)`."""
    maintenant = datetime.now(UTC)
    jti = str(uuid.uuid4())
    claims: dict[str, Any] = {
        "iss": EMETTEUR,
        "sub": username,
        "aud": [AUDIENCE_IA, AUDIENCE_MCP],
        "iat": maintenant,
        "nbf": maintenant,
        "exp": maintenant + DUREE_JETON_AGENT,
        "jti": jti,
        "uid": utilisateur_id,
        "scope": SCOPE_LECTURE,
    }
    return jwt.encode(claims, cles.privee, algorithm="RS256", headers={"kid": cles.identifiant}), jti


def verifier_jeton_agent(cles: JeuDeCles, jeton: str) -> tuple[int, str, str]:
    """Vérifie un jeton agent pour le serveur MCP. Retourne `(utilisateur_id, username, scope)`."""
    claims = _decoder(jeton, cles, audience=AUDIENCE_MCP)
    uid = claims.get("uid")
    if isinstance(uid, bool) or not isinstance(uid, int):
        raise JetonInvalide("claim uid absent")
    return uid, claims["sub"], str(claims.get("scope") or "")
