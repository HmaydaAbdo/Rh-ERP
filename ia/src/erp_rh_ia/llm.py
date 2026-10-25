"""Accès aux modèles, uniquement par la passerelle LiteLLM."""

from enum import StrEnum
from typing import Any

import httpx
from openai import AsyncOpenAI

from erp_rh_ia.config import Settings


class Tache(StrEnum):
    """Tag de capacité LiteLLM (litellm/litellm_config.yaml). Toujours un tag par requête."""

    SIMPLE = "simple"
    MEDIUM = "medium"
    COMPLEX = "complex"
    CODE = "code"
    OCR = "ocr"


def creer_client(settings: Settings) -> AsyncOpenAI:
    return AsyncOpenAI(
        base_url=str(settings.litellm_base_url),
        api_key=settings.litellm_api_key.get_secret_value(),
        timeout=settings.llm_timeout_seconds,
        # La passerelle bascule déjà entre fournisseurs ; ne pas multiplier les tentatives ici.
        max_retries=0,
    )


def options_tache(tache: Tache) -> dict[str, Any]:
    """Corps additionnel qui route la requête vers le pool de la tâche."""
    return {"metadata": {"tags": [tache.value]}}


def url_disponibilite(settings: Settings) -> str:
    """Sonde de disponibilité de LiteLLM, à la racine du serveur (hors /v1)."""
    racine = str(settings.litellm_base_url).rstrip("/").removesuffix("/v1")
    return f"{racine}/health/readiness"


async def passerelle_prete(settings: Settings, client: httpx.AsyncClient) -> bool:
    try:
        reponse = await client.get(url_disponibilite(settings), timeout=5.0)
    except httpx.HTTPError:
        return False
    return reponse.status_code == 200
