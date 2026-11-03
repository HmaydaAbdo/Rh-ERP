"""Fixtures partagées : PostgreSQL réel (même image que les tests Java), schéma Alembic, application complète.

Sans Docker, les tests qui en ont besoin sont ignorés avec la cause (jamais un faux succès).
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

import asyncio
import base64
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pwdlib.hashers.bcrypt import BcryptHasher
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from testcontainers.community.postgres import PostgresContainer  # pyright: ignore[reportMissingTypeStubs]

from staport.domains.auth.composition import ContexteAuth, creer_contexte
from staport.domains.auth.securite import Hacheur
from staport.domains.common.securite import EvenementSecurite
from staport.main import creer_app
from staport.platform.configuration import Configuration

RACINE = Path(__file__).resolve().parent.parent
IMAGE = "pgvector/pgvector:0.8.7-pg18"
MOT_DE_PASSE_PROPRIETAIRE = "mdp-proprietaire"
ORIGINE = "http://localhost:5002"
ADMIN = ("admin-essai", "mdp-admin-essai-123")


@pytest.fixture(scope="session")
def postgres() -> Iterator[PostgresContainer]:
    try:
        conteneur = PostgresContainer(
            IMAGE, username="staport", password=MOT_DE_PASSE_PROPRIETAIRE, dbname="essai", driver="psycopg"
        )
        conteneur.start()
    except Exception as cause:  # Docker absent ou image indisponible
        pytest.skip(f"PostgreSQL de test indisponible : {type(cause).__name__}")
    try:
        yield conteneur
    finally:
        conteneur.stop()


def url_base(postgres: PostgresContainer, base: str) -> str:
    return make_url(postgres.get_connection_url()).set(database=base).render_as_string(hide_password=False)


@pytest.fixture(scope="session")
def creer_base(postgres: PostgresContainer) -> Callable[[str], str]:
    """Crée une base vierge et retourne son URL SQLAlchemy (compte propriétaire)."""

    def creer(nom: str) -> str:
        admin = create_engine(url_base(postgres, "essai"), isolation_level="AUTOCOMMIT")
        with admin.connect() as c:
            c.execute(text(f'CREATE DATABASE "{nom}"'))
        admin.dispose()
        return url_base(postgres, nom)

    return creer


def configuration_alembic(url: str) -> Config:
    config = Config(str(RACINE / "alembic.ini"))
    config.set_main_option("script_location", str(RACINE / "src" / "staport" / "migrations"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


@pytest.fixture(scope="session")
def cle_rsa_b64() -> str:
    """Clé privée RSA 3072 bits (PKCS#8 DER en base64), générée une fois."""
    cle = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    der = cle.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    return base64.b64encode(der).decode("ascii")


@dataclass
class Journal:
    """Événements de sécurité et courriels capturés pendant les tests."""

    evenements: list[EvenementSecurite] = field(default_factory=lambda: [])
    courriels: list[tuple[str, str]] = field(default_factory=lambda: [])  # (destinataire, jeton brut)
    saturation: bool = False

    def publier(self, evenement: EvenementSecurite) -> None:
        self.evenements.append(evenement)

    def de(self, utilisateur: str | None = None, action: str | None = None) -> list[EvenementSecurite]:
        return [
            e
            for e in self.evenements
            if (utilisateur is None or e.utilisateur_nom == utilisateur) and (action is None or e.action == action)
        ]


@dataclass
class Plateforme:
    app: FastAPI
    client: TestClient
    contexte: ContexteAuth
    configuration: Configuration
    moteur: Engine
    journal: Journal
    url: str
    cle_b64: str


def construire_configuration(url: str, cle_b64: str, **remplacements: Any) -> Configuration:
    u = make_url(url)
    valeurs: dict[str, Any] = {
        "db_host": u.host,
        "db_port": u.port,
        "db_name": u.database,
        "db_user": u.username,
        "db_password": u.password,
        "db_migration_user": u.username,
        "db_migration_password": u.password,
        "frontend_url": ORIGINE,
        "cors_allowed_origins": ORIGINE,
        "cookie_secure": False,
        "mcp_enabled": True,
        "mcp_jwt_private_key": cle_b64,
        "mcp_jwt_key_id": "cle-essai-1",
        "admin_username": ADMIN[0],
        "admin_email": "admin-essai@example.org",
        "admin_password": ADMIN[1],
        "smtp_host": "localhost",
        "smtp_port": 1025,
        "smtp_username": "",
        "smtp_password": "",
        "smtp_auth": False,
        "smtp_starttls": False,
        "mail_from": "noreply@example.org",
        "chantier_sync_base_url": "http://chantiers.example/getChantiers",
        **remplacements,
    }
    return Configuration(**valeurs)  # pyright: ignore[reportCallIssue]


def construire_contexte(configuration: Configuration, journal: Journal) -> ContexteAuth:
    contexte = creer_contexte(configuration, evenements=journal)

    def capture(destinataire: str, jeton: str, _validite: object) -> None:
        if journal.saturation:
            from staport.domains.auth.courriel import FileSaturee

            raise FileSaturee
        journal.courriels.append((destinataire, jeton))

    setattr(contexte.courriel, "envoyer_lien_reinitialisation", capture)  # noqa: B010
    return contexte


@pytest.fixture(scope="session")
def plateforme(creer_base: Callable[[str], str], cle_rsa_b64: str) -> Iterator[Plateforme]:
    """Application complète sur un schéma Alembic réel ; l'administrateur est créé par l'amorçage."""
    url = creer_base("auth")
    command.upgrade(configuration_alembic(url), "head")
    configuration = construire_configuration(url, cle_rsa_b64)
    journal = Journal()
    contexte = construire_contexte(configuration, journal)
    moteur = create_engine(url)
    # Sous Windows, psycopg asynchrone refuse la boucle Proactor par défaut : boucle à sélecteur (celle de Linux).
    app = creer_app(configuration, contexte=contexte)
    with TestClient(
        app,
        raise_server_exceptions=False,
        backend_options={"loop_factory": asyncio.SelectorEventLoop},
    ) as client:
        yield Plateforme(app, client, contexte, configuration, moteur, journal, url, cle_rsa_b64)
    moteur.dispose()


@pytest.fixture
def creer_utilisateur(plateforme: Plateforme) -> Callable[..., tuple[int, str]]:
    """Insère un compte (hors API) et retourne `(id, mot de passe)`. `bcrypt=True` : empreinte au format de Spring."""

    def creer(
        prefixe: str = "u",
        mot_de_passe: str = "mot-de-passe-valide",
        actif: bool = True,
        roles: tuple[str, ...] = (),
        refusees: tuple[str, ...] = (),
        bcrypt: bool = False,
        username: str | None = None,
        email: str | None = None,
    ) -> tuple[int, str]:
        nom = username or f"{prefixe}-{uuid.uuid4().hex[:10]}"
        courriel = email or f"{nom}@example.org"
        empreinte = (
            BcryptHasher(rounds=10, prefix="2a").hash(mot_de_passe) if bcrypt else Hacheur().hacher_sync(mot_de_passe)
        )
        with plateforme.moteur.begin() as c:
            identifiant = c.execute(
                text(
                    "INSERT INTO utilisateur (username, email, mot_de_passe_hash, actif) "
                    "VALUES (:u, :e, :h, :a) RETURNING id"
                ),
                {"u": nom, "e": courriel, "h": empreinte, "a": actif},
            ).scalar_one()
            for role in roles:
                c.execute(
                    text(
                        "INSERT INTO utilisateur_role (utilisateur_id, role_id) SELECT :i, id FROM role WHERE nom = :r"
                    ),
                    {"i": identifiant, "r": role},
                )
            for code in refusees:
                c.execute(
                    text(
                        "INSERT INTO utilisateur_permission_refusee (utilisateur_id, permission_id) "
                        "SELECT :i, id FROM permission WHERE code = :c"
                    ),
                    {"i": identifiant, "c": code},
                )
        return identifiant, mot_de_passe

    return creer


@pytest.fixture(autouse=True)
def cookies_vierges(request: pytest.FixtureRequest) -> None:
    """Client de test partagé (une seule boucle d'événements) : ses cookies ne passent pas d'un test à l'autre."""
    if "plateforme" in request.fixturenames:
        request.getfixturevalue("plateforme").client.cookies.clear()


@pytest.fixture
def connecter(plateforme: Plateforme) -> Callable[[str, str], dict[str, Any]]:
    """Ouvre une session HTTP et retourne le corps de la réponse (`accessToken`, `utilisateur`)."""

    def connexion(username: str, mot_de_passe: str) -> dict[str, Any]:
        reponse = plateforme.client.post("/auth/login", json={"username": username, "password": mot_de_passe})
        assert reponse.status_code == 200, reponse.text
        return reponse.json()

    return connexion
