"""Configuration : mêmes variables que Spring, démarrage refusé si l'une manque, secrets jamais affichés (KAN-212)."""

import pytest
from pydantic import ValidationError

from staport.platform.configuration import Configuration

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
    assert "secret-app" in c.url_application() and "secret-migration" in c.url_migration()
    assert c.url_application().startswith("postgresql+psycopg://staport_app:")
    assert c.url_migration().startswith("postgresql+psycopg://staport:")
