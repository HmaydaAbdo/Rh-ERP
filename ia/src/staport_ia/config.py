"""Configuration typée, lue uniquement dans l'environnement (le .env racine unique en local).

Aucune valeur par défaut pour ce qui dépend de l'environnement : le service refuse de démarrer
si une variable obligatoire manque (conventions/configuration.md).
"""

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IA_", extra="ignore", frozen=True)

    # Interrupteur global : faux, le service répond « IA désactivée » sans appeler de modèle.
    enabled: bool
    # Racine de l'API compatible OpenAI de la passerelle, par exemple http://litellm:4000/v1.
    litellm_base_url: AnyHttpUrl
    # Clé virtuelle LiteLLM propre à Staport Intelligence (jamais la clé master).
    litellm_api_key: SecretStr = Field(min_length=8)
    # Alias unique exposé par la passerelle ; la tâche est choisie par tag, pas par nom de modèle.
    litellm_model: str = Field(default="ai-gateway", min_length=1)
    # Groupe LiteLLM du modèle de repli (KAN-265) : si le modèle principal échoue après le basculement de la passerelle,
    # `ModelFallbackMiddleware` essaie ce groupe, d'une autre famille de modèles que `complex`. Vide : aucun repli.
    llm_repli: Literal["", "simple", "medium", "code"] = "medium"
    # Variante mesurée au banc (KAN-261) : un sous-agent par domaine à sortie structurée ; faux par défaut.
    sous_agents: bool = False
    llm_timeout_seconds: float = Field(default=120.0, gt=0, le=600)
    # Base PostgreSQL des conversations (base `ia` de l'ERP) ; absente, elles restent en mémoire du processus.
    database_url: SecretStr | None = None
    # Une conversation inactive depuis ce nombre de jours est supprimée.
    conversation_jours: int = Field(default=30, ge=1, le=365)
    # Pièces jointes à une question (KAN-93) : activées ; images, PDF et texte, revérifiés ici (type réel, antivirus).
    # Sans antivirus joignable, aucun fichier n'est accepté (échec fermé).
    pieces_jointes: bool = True
    # Démon ClamAV (clamd) qui analyse chaque fichier joint ; absent : les pièces jointes sont refusées.
    antivirus_hote: str | None = None
    antivirus_port: int = Field(default=3310, ge=1, le=65535)
    # Racine de l'API (jeton agent et route /mcp), par exemple http://backend:8080.
    erp_api_url: AnyHttpUrl
    # Documents Office produits par l'agent : deux serveurs MCP open source (Word, PowerPoint et Excel simple ; Excel
    # riche), une clé commune, et le dossier partagé où le premier écrit ses fichiers. Sans adresse, aucun outil de
    # documents n'est proposé.
    bureautique_office_url: AnyHttpUrl | None = None
    bureautique_excel_url: AnyHttpUrl | None = None
    bureautique_cle: SecretStr | None = Field(default=None, min_length=16)
    bureautique_dossier: str = "/documents"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # valeurs fournies par l'environnement
