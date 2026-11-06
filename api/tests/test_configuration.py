"""Configuration : mêmes variables que Spring, démarrage refusé si l'une manque, secrets jamais affichés (KAN-212)."""

import pytest
from pydantic import ValidationError

from staport.platform.configuration import Configuration, ConfigurationMigration

VARIABLES = {
    "DB_HOST": "postgres",
    "DB_PORT": "5432",
    "DB_NAME": "staport_rh",
    "DB_USER": "staport_app",
    "DB_PASSWORD": "secret-app",
    "DB_MIGRATION_USER": "staport",
    "DB_MIGRATION_PASSWORD": "secret-migration",
    "FRONTEND_URL": "http://localhost:5002",
    "CORS_ALLOWED_ORIGINS": "http://localhost:5002",
    "COOKIE_SECURE": "false",
    "MCP_ENABLED": "true",
    "MCP_JWT_PRIVATE_KEY": "cle-privee",
    "MCP_JWT_KEY_ID": "cle-1",
    "ADMIN_USERNAME": "admin",
    "ADMIN_EMAIL": "admin@example.org",
    "ADMIN_PASSWORD": "secret-admin",
    "SMTP_HOST": "localhost",
    "SMTP_PORT": "1025",
    "SMTP_USERNAME": "",
    "SMTP_PASSWORD": "",
    "SMTP_AUTH": "false",
    "SMTP_STARTTLS": "false",
    "MAIL_FROM": "noreply@example.org",
    "CHANTIER_SYNC_BASE_URL": "http://chantiers.example/getChantiers",
}


def _poser(monkeypatch: pytest.MonkeyPatch, **retirer: str) -> None:
    for nom, valeur in VARIABLES.items():
        if nom not in retirer:
            monkeypatch.setenv(nom, valeur)


def test_les_variables_de_spring_suffisent(monkeypatch: pytest.MonkeyPatch) -> None:
    _poser(monkeypatch)
    c = Configuration()  # pyright: ignore[reportCallIssue]
    assert c.db_port == 5432 and c.cookie_secure is False and c.smtp_auth is False
    assert c.springdoc_api_docs_enabled is False and c.springdoc_swagger_ui_enabled is False
    assert c.logging_format == "text"


def test_une_variable_absente_fait_echouer_le_demarrage(monkeypatch: pytest.MonkeyPatch) -> None:
    _poser(monkeypatch, DB_PASSWORD="")
    monkeypatch.delenv("DB_PASSWORD", raising=False)
    with pytest.raises(ValidationError, match="db_password"):
        Configuration()  # pyright: ignore[reportCallIssue]


def test_les_secrets_ne_sont_jamais_affiches(monkeypatch: pytest.MonkeyPatch) -> None:
    _poser(monkeypatch)
    c = Configuration()  # pyright: ignore[reportCallIssue]
    assert "secret-app" not in repr(c) and "secret-admin" not in str(c)
    migration = ConfigurationMigration()  # pyright: ignore[reportCallIssue]
    assert "secret-migration" not in repr(migration)
    assert c.url_application().password == VARIABLES["DB_PASSWORD"]
    assert migration.url_migration().password == VARIABLES["DB_MIGRATION_PASSWORD"]
    assert c.url_application().username == "staport_app"
    assert migration.url_migration().username == "staport"


def test_urls_acceptent_les_caracteres_speciaux_sans_exposer_les_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    _poser(monkeypatch)
    valeur_app = "app@mot/de:passe%"
    valeur_migration = "migration@mot/de:passe%"
    monkeypatch.setenv("DB_PASSWORD", valeur_app)
    monkeypatch.setenv("DB_MIGRATION_PASSWORD", valeur_migration)
    application = Configuration().url_application()  # pyright: ignore[reportCallIssue]
    migration = ConfigurationMigration().url_migration()  # pyright: ignore[reportCallIssue]
    assert application.password == valeur_app
    assert migration.password == valeur_migration
    assert application.host == migration.host == "postgres"
    assert "mot/de:passe" not in str(application) and "mot/de:passe" not in str(migration)


def test_identifiants_migration_requis_uniquement_pour_alembic(monkeypatch: pytest.MonkeyPatch) -> None:
    _poser(monkeypatch)
    monkeypatch.delenv("DB_MIGRATION_USER", raising=False)
    monkeypatch.delenv("DB_MIGRATION_PASSWORD", raising=False)
    Configuration()  # pyright: ignore[reportCallIssue]
    with pytest.raises(ValidationError, match="db_migration_user"):
        ConfigurationMigration()  # pyright: ignore[reportCallIssue]


def test_migration_exige_aussi_le_compte_applicatif(monkeypatch: pytest.MonkeyPatch) -> None:
    _poser(monkeypatch)
    monkeypatch.delenv("DB_PASSWORD", raising=False)
    with pytest.raises(ValidationError, match="db_password"):
        ConfigurationMigration()  # pyright: ignore[reportCallIssue]
