"""Le modèle vu par l'agent : choisir des outils, puis rédiger une réponse structurée. Toujours par LiteLLM."""

import json
from dataclasses import dataclass
from typing import Any, Protocol, cast

from openai import APIError, AsyncOpenAI, InternalServerError

from erp_rh_ia.llm import Tache, options_tache
from erp_rh_ia.outils import OutilDecrit


@dataclass(frozen=True)
class AppelOutil:
    identifiant: str
    nom: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class Choix:
    appels: list[AppelOutil]
    texte: str


@dataclass(frozen=True)
class Brouillon:
    reponse: str
    vue: int | None
    abstention: bool


class Modele(Protocol):
    async def cibler(self, messages: list[dict[str, Any]], domaines: list[str]) -> list[str] | None: ...

    async def choisir(self, messages: list[dict[str, Any]], outils: list[OutilDecrit]) -> Choix: ...

    async def rediger(self, messages: list[dict[str, Any]]) -> Brouillon: ...


FORMAT_REPONSE: dict[str, Any] = {
    "type": "json_schema",
    "json_schema": {
        "name": "reponse_erp_rh",
        "schema": {
            "type": "object",
            "properties": {
                "reponse": {"type": "string"},
                "vue": {"type": ["integer", "null"]},
                "abstention": {"type": "boolean"},
            },
            "required": ["reponse", "vue", "abstention"],
            "additionalProperties": False,
        },
    },
}


def format_ciblage(domaines: list[str]) -> dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "domaines_erp_rh",
            "schema": {
                "type": "object",
                "properties": {"domaines": {"type": "array", "items": {"type": "string", "enum": domaines}}},
                "required": ["domaines"],
                "additionalProperties": False,
            },
        },
    }


class ModeleLiteLLM:
    """Ciblage des domaines (tag ``simple``), puis outils et rédaction JSON (tag ``complex``)."""

    def __init__(self, client: AsyncOpenAI, alias: str, max_tokens: int = 1500) -> None:
        self._client = client
        self._alias = alias
        self._max_tokens = max_tokens

    async def cibler(self, messages: list[dict[str, Any]], domaines: list[str]) -> list[str] | None:
        """Le ciblage n'est qu'une économie : s'il échoue, la question part avec tout le catalogue."""
        try:
            reponse = await self._client.chat.completions.create(
                model=self._alias,
                messages=cast(Any, messages),
                response_format=cast(Any, format_ciblage(domaines)),
                temperature=0,
                max_tokens=200,
                extra_body=options_tache(Tache.SIMPLE),
            )
        except APIError:
            return None
        return lire_domaines(reponse.choices[0].message.content or "", domaines)

    async def choisir(self, messages: list[dict[str, Any]], outils: list[OutilDecrit]) -> Choix:
        definitions = [
            {
                "type": "function",
                "function": {"name": o.nom, "description": o.description, "parameters": o.schema_entree},
            }
            for o in outils
        ]
        reponse = await self._client.chat.completions.create(
            model=self._alias,
            messages=cast(Any, messages),
            tools=cast(Any, definitions),
            tool_choice="auto",
            temperature=0,
            max_tokens=self._max_tokens,
            extra_body=options_tache(Tache.COMPLEX),
        )
        message = reponse.choices[0].message
        appels: list[AppelOutil] = []
        for appel in message.tool_calls or []:
            fonction = getattr(appel, "function", None)
            if fonction is None:
                continue
            appels.append(AppelOutil(appel.id, fonction.name, _arguments(fonction.arguments)))
        return Choix(appels=appels, texte=message.content or "")

    async def rediger(self, messages: list[dict[str, Any]]) -> Brouillon:
        try:
            reponse = await self._client.chat.completions.create(
                model=self._alias,
                messages=cast(Any, messages),
                response_format=cast(Any, FORMAT_REPONSE),
                temperature=0,
                max_tokens=self._max_tokens,
                extra_body=options_tache(Tache.COMPLEX),
            )
        except InternalServerError as erreur:
            # Sortie hors schéma refusée par la passerelle : même traitement qu'un JSON invalide.
            if "JSONSchemaValidationError" not in str(erreur):
                raise
            return Brouillon("", None, True)
        return lire_brouillon(reponse.choices[0].message.content or "")


def lire_domaines(texte: str, domaines: list[str]) -> list[str] | None:
    """``None`` si la sortie est invalide : l'agent garde alors tout le catalogue plutôt que d'en masquer une partie."""
    try:
        valeurs = json.loads(_sans_cloture(texte))
    except json.JSONDecodeError:
        return None
    choisis = cast(dict[str, Any], valeurs).get("domaines") if isinstance(valeurs, dict) else None
    if not isinstance(choisis, list):
        return None
    retenus = [d for d in cast(list[Any], choisis) if isinstance(d, str)]
    if any(d not in domaines for d in retenus):
        return None
    return list(dict.fromkeys(retenus))


def lire_brouillon(texte: str) -> Brouillon:
    """Une sortie non conforme au schéma devient une abstention, jamais une réponse partielle."""
    try:
        valeurs = json.loads(_sans_cloture(texte))
    except json.JSONDecodeError:
        return Brouillon("", None, True)
    if not isinstance(valeurs, dict):
        return Brouillon("", None, True)
    donnees = cast(dict[str, Any], valeurs)
    reponse = donnees.get("reponse")
    vue = donnees.get("vue")
    abstention = donnees.get("abstention")
    if not isinstance(reponse, str) or not isinstance(abstention, bool):
        return Brouillon("", None, True)
    return Brouillon(reponse, vue if isinstance(vue, int) and not isinstance(vue, bool) else None, abstention)


def _sans_cloture(texte: str) -> str:
    return texte.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()


def _arguments(brut: str) -> dict[str, Any]:
    try:
        valeurs = json.loads(brut or "{}")
    except json.JSONDecodeError:
        return {}
    return cast(dict[str, Any], valeurs) if isinstance(valeurs, dict) else {}
