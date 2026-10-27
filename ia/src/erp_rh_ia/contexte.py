# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces deux règles sont levées,
# et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Contexte ERP fourni à l'agent dès le départ (docs/ia.md, harnais de l'agent).

Sans lui, presque chaque question commence par deux appels de modèle pour apprendre ce que l'ERP sait déjà : qui est
l'utilisateur et quel est le dernier mois de paie importé. Ici, le middleware officiel ``before_agent`` appelle une
seule fois, sans modèle, les outils MCP ``systeme_identite`` et ``paie_periodes`` du même jeu d'outils (donc avec le
jeton et les droits de l'utilisateur), puis ``wrap_model_call`` ajoute le résultat au message système : date du jour,
droits utiles, dernier mois de paie. Un refus d'outil (droit absent) ou une panne laisse le contexte plus court.
"""

import json
from collections.abc import Awaitable, Callable, Sequence
from datetime import date
from typing import Annotated, Any, NotRequired, cast

from langchain.agents.middleware import AgentMiddleware, AgentState, ModelRequest, ModelResponse
from langchain.agents.middleware.types import PrivateStateAttr
from langchain_core.messages import SystemMessage
from langchain_core.tools import BaseTool
from langgraph.runtime import Runtime

#: Permissions qui changent ce que l'agent peut faire ; les autres n'ajoutent que du bruit au contexte.
_DROITS_UTILES = ("PAIE_READ", "EMPLOYEE_READ", "CHANTIER_READ", "EQUIPE_READ", "FUNCTION_READ", "AUDIT_READ")


class EtatContexte(AgentState[Any]):
    contexte_erp: NotRequired[Annotated[str, PrivateStateAttr]]


class ContexteErp(AgentMiddleware[EtatContexte, Any]):
    """Date, droits et dernier mois de paie, lus une fois par run à travers les outils de l'utilisateur."""

    state_schema = EtatContexte

    def __init__(self, outils: Sequence[BaseTool], aujourdhui: Callable[[], date] = date.today) -> None:
        super().__init__()
        self._outils = {outil.name: outil for outil in outils}
        self._aujourdhui = aujourdhui

    async def abefore_agent(self, state: EtatContexte, runtime: Runtime[Any]) -> dict[str, Any] | None:
        lignes = [f"Date du jour : {self._aujourdhui().isoformat()}."]
        identite = await self._appeler("systeme_identite")
        if identite is not None:
            autorites = {str(a) for a in cast(list[Any], identite.get("autorites") or [])}
            droits = [d for d in _DROITS_UTILES if d in autorites]
            lignes.append(f"Droits de lecture de l'utilisateur : {', '.join(droits) if droits else 'aucun'}.")
        periodes = (
            await self._appeler("paie_periodes", {"limite": 1}) if "PAIE_READ" in self._droits(identite) else None
        )
        derniere = cast(list[dict[str, Any]], (periodes or {}).get("periodes") or [])
        if derniere:
            lignes.append(
                f"Dernier mois de paie importé : {derniere[0].get('periode')} ; c'est le mois par défaut de tous les "
                "outils de paie et d'employés, ne cherche pas à le connaître."
            )
        return {"contexte_erp": "\n".join(lignes)}

    async def awrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], Awaitable[ModelResponse[Any]]],
    ) -> ModelResponse[Any]:
        contexte = request.state.get("contexte_erp")
        if not contexte:
            return await handler(request)
        base = request.system_message.text if request.system_message else ""
        return await handler(
            request.override(
                system_message=SystemMessage(content=f"{base}\n\nContexte du moment (fourni par l'ERP) :\n{contexte}")
            )
        )

    @staticmethod
    def _droits(identite: dict[str, Any] | None) -> set[str]:
        return {str(a) for a in cast(list[Any], (identite or {}).get("autorites") or [])}

    async def _appeler(self, nom: str, arguments: dict[str, Any] | None = None) -> dict[str, Any] | None:
        outil = self._outils.get(nom)
        if outil is None:
            return None
        try:
            resultat = await outil.ainvoke(arguments or {})
        except Exception:  # droit absent ou panne : le contexte reste plus court, la question continue
            return None
        texte = resultat if isinstance(resultat, str) else getattr(resultat, "content", "")
        try:
            donnees = json.loads(texte) if isinstance(texte, str) else None
        except ValueError:
            return None
        return cast(dict[str, Any], donnees) if isinstance(donnees, dict) else None
