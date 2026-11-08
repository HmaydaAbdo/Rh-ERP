"""Configuration de l'application (KAN-212, ADR 0016 § 2 et conventions `backend-python/configuration`).

Mêmes noms de variables d'environnement que le backend Spring (`application.yml`) : le `.env` et le compose de
production ne changent pas. Aucune valeur par défaut pour un secret ni pour un paramètre qui change le comportement en
production : une variable absente fait échouer le démarrage, jamais une valeur devinée.
"""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Configuration(BaseSettings):
    model_config = SettingsConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    # Base de données (compte applicatif ; le compte propriétaire des migrations est distinct, ADR § 3)
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: SecretStr

    # Authentification et CORS
    frontend_url: str
    cors_allowed_origins: str
    cookie_secure: bool

    # Jetons : un seul jeu de clés RSA (PKCS#8 en base64) signe les jetons d'accès utilisateur et ceux de l'agent IA,
    # séparés par leur audience. Rotation : clé précédente en clé publique (X.509) pendant la transition.
    # MCP_ENABLED n'active que l'agent IA (émission du jeton délégué, JWKS public, route /mcp).
    mcp_enabled: bool
    mcp_jwt_private_key: SecretStr
    mcp_jwt_key_id: str
    mcp_jwt_previous_public_key: str = ""
    mcp_jwt_previous_key_id: str = ""

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

    # Audit : période de la vérification de la chaîne d'intégrité du journal (par défaut une fois par jour)
    audit_integrite_chaine_delai_ms: int = 86_400_000

    # Documentation d'API : éteinte par défaut, donc en production. `SPRINGDOC_*` : noms hérités de l'ancien backend,
    # conservés pour ne pas changer les `.env`. La spécification (`/openapi.json`) et l'interface (`/docs`) se règlent
    # séparément ; éteintes, leurs routes n'existent pas (`404`).
    springdoc_api_docs_enabled: bool = False
    springdoc_swagger_ui_enabled: bool = False

    # Journaux : text (défaut) ou json (production) ; répertoire des journaux archivés chaque jour (facultatif)
    logging_format: str = "text"
    logging_file_path: str = ""

    def url_application(self) -> URL:
        """URL SQLAlchemy asynchrone du compte applicatif (pilote psycopg 3, documenté pour l'asynchrone)."""
        return URL.create(
            "postgresql+psycopg",
            username=self.db_user,
            password=self.db_password.get_secret_value(),
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )


class ConfigurationMigration(BaseSettings):
    """Paramètres du processus Alembic, distincts de ceux de l'API."""

    db_host: str
    db_port: int
    db_name: str
    db_migration_user: str
    db_migration_password: SecretStr
    db_user: str
    db_password: SecretStr

    def url_migration(self) -> URL:
        """URL du compte propriétaire du schéma, utilisée seulement par l'étape de migration du déploiement."""
        return URL.create(
            "postgresql+psycopg",
            username=self.db_migration_user,
            password=self.db_migration_password.get_secret_value(),
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )


@lru_cache
def configuration() -> Configuration:
    return Configuration()  # pyright: ignore[reportCallIssue]
