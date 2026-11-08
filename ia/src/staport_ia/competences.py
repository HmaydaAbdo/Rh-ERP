# deepagents ne publie pas de stubs complets : seules ces règles sont levées, et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Compétences par domaine : les outils métier ne sont exposés au modèle que par elles (site/docs/ia, T32).

Une compétence est un dossier ``competences/<domaine>/SKILL.md`` dont l'en-tête liste ses outils
(``metadata.include_tools``). Le ``SkillsMiddleware`` de Deep Agents protège ces outils : un appel échoue comme un outil
inconnu tant que la compétence n'est pas épinglée (``pinned_skills``, choisie hors modèle par ``routage.py``) ou que le
modèle n'en a pas lu le ``SKILL.md`` (repli officiel). Le résolveur ne rend que les outils du catalogue MCP de
l'utilisateur de ce run, donc déjà limités à ses droits par Spring.
"""

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from functools import cache
from importlib import resources
from pathlib import Path
from typing import Any, cast

import yaml
from langchain_core.tools import BaseTool

#: Outils exposés à chaque tour sans compétence : transversaux et sans donnée métier (``generate_a2ui`` est l'outil
#: d'interface composée que CopilotKit injecte ; il ne vient pas du catalogue MCP).
OUTILS_PERMANENTS = frozenset({"systeme_identite", "generate_a2ui"})

#: Au plus ce nombre d'outils par compétence : au-delà, le domaine est scindé (site/docs/ia, T32).
OUTILS_MAX_PAR_COMPETENCE = 7


@dataclass(frozen=True)
class Competence:
    nom: str
    description: str
    outils: tuple[str, ...]


def dossier_competences() -> Path:
    return Path(str(resources.files("staport_ia").joinpath("competences")))


@cache
def charger() -> Mapping[str, Competence]:
    """Les compétences du paquet, lues dans leurs ``SKILL.md`` (la source unique, aussi lue par le harnais)."""
    competences: dict[str, Competence] = {}
    for fichier in sorted(dossier_competences().glob("*/SKILL.md")):
        entete = cast(dict[str, Any], yaml.safe_load(fichier.read_text(encoding="utf-8").split("---")[1]))
        outils = tuple(str(entete["metadata"]["include_tools"]).split())
        competences[str(entete["name"])] = Competence(str(entete["name"]), str(entete["description"]), outils)
    return competences


def competence_de(outil: str) -> str | None:
    """Le domaine qui expose cet outil, ``None`` pour un outil permanent ou inconnu."""
    return next((c.nom for c in charger().values() if outil in c.outils), None)


def resolveur(outils: Sequence[BaseTool]) -> Callable[[str, Any], list[BaseTool]]:
    """Résolveur du ``SkillsMiddleware`` : l'outil demandé s'il fait partie du catalogue MCP de l'utilisateur du run."""
    par_nom = {outil.name: outil for outil in outils}

    def resoudre(nom: str, _runtime: Any) -> list[BaseTool]:
        return [par_nom[nom]] if nom in par_nom else []

    return resoudre
