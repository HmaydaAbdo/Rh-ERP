"""Modèles de chat LangChain servis par la passerelle LiteLLM (docs/ia.md, T10).

``ChatLiteLLM`` (``langchain-litellm``) plutôt que ``ChatOpenAI`` : c'est le seul des deux qui transmet le raisonnement
renvoyé par la passerelle (``reasoning_content``), que ``ag-ui-langgraph`` diffuse en événements ``REASONING_*``
(mesuré le 2026-10-26). La tâche est choisie par tag LiteLLM, jamais par nom de modèle.
"""

from enum import StrEnum

from langchain_litellm import ChatLiteLLM

from erp_rh_ia.config import Settings


class Tache(StrEnum):
    """Tag de capacité LiteLLM (litellm/litellm_config.yaml)."""

    SIMPLE = "simple"
    MEDIUM = "medium"
    COMPLEX = "complex"
    CODE = "code"
    OCR = "ocr"


def modele(settings: Settings, tache: Tache, *, max_tokens: int = 1500) -> ChatLiteLLM:
    """Un modèle de chat pour la tâche ; la passerelle bascule déjà entre fournisseurs, sans nouvel essai ici."""
    return ChatLiteLLM(
        model=f"litellm_proxy/{settings.litellm_model}",
        api_base=str(settings.litellm_base_url),
        api_key=settings.litellm_api_key.get_secret_value(),
        # Corps additionnel transmis tel quel à la passerelle : le tag route la requête vers le pool de la tâche.
        model_kwargs={"extra_body": {"metadata": {"tags": [tache.value]}}},
        max_tokens=max_tokens,
        request_timeout=settings.llm_timeout_seconds,
        max_retries=0,
        streaming=True,
    )
