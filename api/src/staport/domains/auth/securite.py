"""Mécanismes de sécurité du domaine auth : mots de passe, jetons opaques, clés et jetons JWT RS256.

- Mots de passe : `pwdlib`, Argon2 pour tout nouveau hachage ; les empreintes BCrypt existantes sont vérifiées puis
  remplacées à la première connexion réussie (`verifier_et_mettre_a_jour`). Le hachage, coûteux par conception, tourne
  hors de la boucle d'événements.
- Jetons opaques (rafraîchissement, réinitialisation) : 256 bits aléatoires, seule leur empreinte SHA-256 est stockée.
- JWT : RS256 uniquement ; la clé privée ne quitte pas le serveur, la clé publique peut être publiée. Encodage et
  vérification par `joserfc` (la bibliothèque JOSE d'Authlib, KAN-74) ; le jeton agent est émis par le serveur OAuth2
  d'`echange_jetons.py`.
"""

import asyncio
import base64
import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cached_property
from typing import Any, cast

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey
from joserfc import jws, jwt
from joserfc.errors import BadSignatureError, JoseError
from joserfc.jwk import Key, KeySet, RSAKey
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

EMETTEUR = "staport-intelligence"
AUDIENCE_IA = "staport-intelligence-ia"
AUDIENCE_MCP = "staport-intelligence-mcp"
AUDIENCE_EXPORT = "staport-intelligence-export"
SCOPE_LECTURE = "mcp:lecture"
PERMISSION_IA = "IA_UTILISER"
DUREE_JETON_AGENT = timedelta(minutes=5)
DUREE_REFERENCE_EXPORT = timedelta(minutes=5)
TAILLE_CLE_MINIMALE = 3072
TOLERANCE_HORLOGE = 60  # secondes d'écart d'horloge admis sur l'échéance d'un jeton


class ConfigurationCles(ValueError):
    """Variable de clé absente ou invalide : le démarrage échoue plutôt que d'accepter une clé faible."""


# --- Mots de passe --------------------------------------------------------------------------------


class Hacheur:
    """Hachage des mots de passe (Argon2 courant, BCrypt existant accepté en lecture)."""

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
    """SHA-256 puis Base64 standard : empreinte stable (les jetons existants restent valides)."""
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


def _jwk_prive(cle: RSAPrivateKey, identifiant: str) -> RSAKey:
    pem = cle.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    return RSAKey.import_key(pem, {"kid": identifiant, "use": "sig", "alg": "RS256"})


def _jwk_public(cle: RSAPublicKey, identifiant: str) -> RSAKey:
    pem = cle.public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    return RSAKey.import_key(pem, {"kid": identifiant, "use": "sig", "alg": "RS256"})


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

    @cached_property
    def cle_signature(self) -> RSAKey:
        return _jwk_prive(self.privee, self.identifiant)

    @cached_property
    def ensemble(self) -> KeySet:
        """Clés de vérification (courante puis précédente) ; la clé du jeton est choisie par son `kid`."""
        cles: list[Key] = [_jwk_public(self.privee.public_key(), self.identifiant)]
        if self.precedente is not None and self.identifiant_precedent is not None:
            cles.append(_jwk_public(self.precedente, self.identifiant_precedent))
        return KeySet(cles)

    def jwks(self) -> dict[str, Any]:
        """Clés publiques (courante puis précédente), sans partie privée."""
        return cast(dict[str, Any], self.ensemble.as_dict(private=False))


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
            "iat": int(maintenant.timestamp()),
            "exp": int((maintenant + duree).timestamp()),
            "uid": utilisateur_id,
            "permissions": sorted(permissions),
            "roles": sorted(roles),
        }
        return _encoder(self._cles, claims)

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


def _encoder(cles: JeuDeCles, claims: dict[str, Any]) -> str:
    return jwt.encode({"alg": "RS256", "kid": cles.identifiant}, claims, cles.cle_signature, algorithms=["RS256"])


def _decoder(jeton: str, cles: JeuDeCles, audience: str) -> dict[str, Any]:
    try:
        # Un `kid` désigne la clé ; les jetons d'accès RFC 9068 d'Authlib n'en portent pas, toutes les clés sont alors
        # essayées (deux au plus, pendant une rotation). Un `kid` inconnu est refusé.
        kid = jws.extract_compact(jeton.encode()).protected.get("kid")
        candidates = [cle for cle in cles.ensemble.keys if kid is None or cle.kid == kid]
        if not candidates:
            raise JetonInvalide("clé inconnue")
        decode = None
        for cle in candidates:
            try:
                decode = jwt.decode(jeton, cle, algorithms=["RS256"])
                break
            except BadSignatureError:
                continue
        if decode is None:
            raise JetonInvalide("signature invalide")
        jwt.JWTClaimsRegistry(
            leeway=TOLERANCE_HORLOGE,
            iss={"essential": True, "value": EMETTEUR},
            aud={"essential": True, "value": audience},
            exp={"essential": True},
            iat={"essential": True},
            sub={"essential": True},
        ).validate(decode.claims)
    except (JoseError, ValueError) as cause:
        raise JetonInvalide(str(cause)) from cause
    claims: dict[str, Any] = decode.claims
    if not isinstance(claims.get("sub"), str) or not claims["sub"].strip():
        raise JetonInvalide("sujet absent")
    return claims


def verifier_jeton_agent(cles: JeuDeCles, jeton: str) -> tuple[int, str, str]:
    """Vérifie un jeton agent pour le serveur MCP. Retourne `(utilisateur_id, username, scope)`."""
    claims = _decoder(jeton, cles, audience=AUDIENCE_MCP)
    uid = claims.get("uid")
    if isinstance(uid, bool) or not isinstance(uid, int):
        raise JetonInvalide("claim uid absent")
    return uid, claims["sub"], str(claims.get("scope") or "")


def emettre_reference_export(
    cles: JeuDeCles, utilisateur_id: int, username: str, periode: int, chantier_ids: list[int]
) -> str:
    """Référence de téléchargement d'un export de paie préparé par l'agent (KAN-266) : un JWT RS256 de 5 minutes, lié à
    l'utilisateur, au mois et aux chantiers. Elle ne donne aucun droit : la route de téléchargement exige en plus la
    connexion de cet utilisateur et la permission d'export."""
    maintenant = datetime.now(UTC)
    claims: dict[str, Any] = {
        "iss": EMETTEUR,
        "sub": username,
        "aud": AUDIENCE_EXPORT,
        "iat": int(maintenant.timestamp()),
        "nbf": int(maintenant.timestamp()),
        "exp": int((maintenant + DUREE_REFERENCE_EXPORT).timestamp()),
        "jti": str(uuid.uuid4()),
        "uid": utilisateur_id,
        "periode": periode,
        "chantierIds": chantier_ids,
    }
    return _encoder(cles, claims)


def verifier_reference_export(cles: JeuDeCles, reference: str) -> tuple[int, int, list[int]]:
    """Vérifie une référence d'export. Retourne `(utilisateur_id, periode, chantier_ids)`."""
    claims = _decoder(reference, cles, audience=AUDIENCE_EXPORT)
    uid, periode, chantiers = claims.get("uid"), claims.get("periode"), claims.get("chantierIds")
    if isinstance(uid, bool) or not isinstance(uid, int) or isinstance(periode, bool) or not isinstance(periode, int):
        raise JetonInvalide("claims d'export absents")
    if not isinstance(chantiers, list) or not all(isinstance(c, int) and not isinstance(c, bool) for c in chantiers):  # pyright: ignore[reportUnknownVariableType]
        raise JetonInvalide("chantiers d'export invalides")
    return uid, periode, list(chantiers)  # pyright: ignore[reportUnknownArgumentType]
