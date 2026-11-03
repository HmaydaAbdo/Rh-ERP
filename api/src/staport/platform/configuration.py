"""Configuration de l'application (KAN-212, ADR 0016 § 2 et conventions `backend-python/configuration`).

Mêmes noms de variables d'environnement que le backend Spring (`application.yml`) : le `.env` et le compose de
production ne changent pas. Aucune valeur par défaut pour un secret ni pour un paramètre qui change le comportement en
production : une variable absente fait échouer le démarrage, jamais une valeur devinée.
"""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuration(BaseSettings):
    model_config = SettingsConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    # Base de données (compte applicatif ; le compte propriétaire des migrations est distinct, ADR § 3)
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: SecretStr
    db_migration_user: str
    db_migration_password: SecretStr

    # Authentification et CORS
    frontend_url: str
    cors_allowed_origins: str
    cookie_secure: bool

    # Compte SYSTEM_ADMIN de bootstrap
    admin_username: str
    admin_email: str
    admin_password: SecretStr

    # Courriel
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: SecretStr
    smtp_auth: bool
    smtp_starttls: bool
    mail_from: str

    # Synchronisation des chantiers
    chantier_sync_base_url: str

    # Documentation d'API : éteinte par défaut, donc en production
    springdoc_api_docs_enabled: bool = False
    springdoc_swagger_ui_enabled: bool = False

    # Journaux : text (défaut) ou json (production)
    logging_format: str = "text"

    def url_application(self) -> str:
        """URL SQLAlchemy asynchrone du compte applicatif (pilote psycopg 3, documenté pour l'asynchrone)."""
        return f"postgresql+psycopg://{self.db_user}:{self.db_password.get_secret_value()}@{self.db_host}:{self.db_port}/{self.db_name}"

    def url_migration(self) -> str:
        """URL du compte propriétaire du schéma, utilisée seulement par l'étape de migration du déploiement."""
        return (
            f"postgresql+psycopg://{self.db_migration_user}:{self.db_migration_password.get_secret_value()}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


@lru_cache
def configuration() -> Configuration:
    return Configuration()  # pyright: ignore[reportCallIssue]
