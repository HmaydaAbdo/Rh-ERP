"""Configuration typée, lue uniquement dans l'environnement (le .env racine unique en local).

Aucune valeur par défaut pour ce qui dépend de l'environnement : le service refuse de démarrer
si une variable obligatoire manque (conventions/configuration.md).
"""

from functools import lru_cache

from pydantic import AnyHttpUrl, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IA_", extra="ignore", frozen=True)

    # Interrupteur global : faux, le service répond « IA désactivée » sans appeler de modèle.
    enabled: bool
    # Racine de l'API compatible OpenAI de la passerelle, par exemple http://litellm:4000/v1.
    litellm_base_url: AnyHttpUrl
    # Clé virtuelle LiteLLM propre à ERP-RH (jamais la clé master).
    litellm_api_key: SecretStr = Field(min_length=8)
    # Alias unique exposé par la passerelle ; la tâche est choisie par tag, pas par nom de modèle.
    litellm_model: str = Field(default="ai-gateway", min_length=1)
    llm_timeout_seconds: float = Field(default=120.0, gt=0, le=600)
    # Racine du backend Spring (jeton agent et route /mcp), par exemple http://backend:8080.
    erp_api_url: AnyHttpUrl


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # valeurs fournies par l'environnement
