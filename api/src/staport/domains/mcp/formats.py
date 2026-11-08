"""Formats et libellés partagés par les paramètres des outils MCP (parité de `Formats`, `SensTri` et `Perimetres`).

Un seul énoncé par notion, pour que le modèle lise partout les mêmes consignes : format des mois, sens de
l'identifiant 0, plafonds des listes d'identifiants. Les contraintes sont des `Field` Pydantic, validées par
FastMCP avant l'appel.
"""

from collections.abc import Callable
from enum import StrEnum
from typing import Annotated, Any, cast

from fastmcp.server.dependencies import get_access_token
from pydantic import Field

from mcp.types import ToolAnnotations
from staport.domains.paie.periode import afficher_periode, lire_periode

PERIODE = r"^[0-9]{4}-(0[1-9]|1[0-2])$"
PERIODE_DOC = "Mois de paie au format aaaa-MM, par exemple 2026-09. Absent = le dernier mois de paie importé."
CHANTIERS_DOC = (
    "Identifiants des chantiers à inclure (entiers, rendus par `chantier_rechercher`). Absent = tous les chantiers."
)
EQUIPES_DOC = (
    "Identifiants des équipes à inclure (rendus par `equipe_rechercher`) ; 0 désigne les employés ou bulletins sans "
    "équipe. Absent = toutes les équipes."
)
FONCTIONS_DOC = (
    "Identifiants des fonctions (métiers) à inclure (rendus par `fonction_rechercher`). Absent = toutes les fonctions."
)
STATUT_EMPLOYE_DOC = "EN_POSTE (employés actuellement en poste) ou SORTI (employés partis). Absent = tous."
SENS_DOC = (
    "Sens du tri : ASC (croissant) ou DESC (décroissant). Absent = le sens par défaut du critère (décroissant pour un "
    "montant ou un effectif, croissant pour un nom ou un code)."
)
PAGE_DOC = (
    "Numéro de la page de résultats, à partir de 0 (0 par défaut). Toutes les pages restent accessibles. Avec `limite` "
    "comme taille de page, permet de parcourir tous les résultats quand `total` dépasse ce qui est rendu."
)
LECTURE_SEULE = ToolAnnotations(
    read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False
)

Page = Annotated[int, Field(ge=0, description=PAGE_DOC)]
Periode = Annotated[str | None, Field(pattern=PERIODE, description=PERIODE_DOC)]
Chantiers = Annotated[list[Annotated[int, Field(ge=0)]] | None, Field(max_length=50, description=CHANTIERS_DOC)]
Equipes = Annotated[list[Annotated[int, Field(ge=0)]] | None, Field(max_length=50, description=EQUIPES_DOC)]
Fonctions = Annotated[list[Annotated[int, Field(ge=0)]] | None, Field(max_length=50, description=FONCTIONS_DOC)]


class SensTri(StrEnum):
    ASC = "ASC"
    DESC = "DESC"


class Dimension(StrEnum):
    """Regroupement des effectifs ou de la paie."""

    CHANTIER = "CHANTIER"
    EQUIPE = "EQUIPE"
    FONCTION = "FONCTION"


class StatutEmploye(StrEnum):
    """Vocabulaire de l'interface (« En poste » / « Sorti »), jamais actif/inactif."""

    EN_POSTE = "EN_POSTE"
    SORTI = "SORTI"


Sens = Annotated[SensTri | None, Field(description=SENS_DOC)]
Statut = Annotated[StatutEmploye | None, Field(description=STATUT_EMPLOYE_DOC)]


def ascendant(sens: SensTri | None, defaut: SensTri) -> bool:
    return (sens or defaut) is SensTri.ASC


def texte(valeur: str | None) -> str | None:
    return None if valeur is None or not valeur.strip() else valeur.strip()


def ids(valeurs: list[int] | None) -> list[int] | None:
    """Identifiants d'une dimension sans doublon ; `None` quand l'argument est absent ou vide (pas de filtre)."""
    return list(dict.fromkeys(valeurs)) if valeurs else None


def mois(valeur: str | None) -> int | None:
    """Le mois demandé (AAAAMM), ou `None` quand l'argument est absent."""
    return None if valeur is None or not valeur.strip() else lire_periode(valeur.strip())


def parametres_url(
    chantiers: list[int] | None, equipes: list[int] | None, fonctions: list[int] | None, periode: int | None = None
) -> dict[str, str]:
    """Paramètres d'URL des vues partagées (`chantierIds=3,7`, …) ; absents quand le filtre est vide."""
    parametres: dict[str, str] = {}
    for cle, valeurs in (("chantierIds", chantiers), ("equipeIds", equipes), ("fonctionIds", fonctions)):
        if valeurs:
            parametres[cle] = ",".join(str(v) for v in valeurs)
    if periode is not None:
        parametres["periode"] = afficher_periode(periode)
    return parametres


def vue(module: str, nom: str, parametres: dict[str, str] | None = None) -> dict[str, Any]:
    """Vue partagée proposée à l'utilisateur (`VueProposeeDto`) : elle n'accorde aucun droit."""
    return {"module": module, "vue": nom, "parametres": parametres or {}}


def voit_la_paie() -> bool:
    """L'appelant détient `PAIE_READ` (règle `ProjectionPaieEmployee.voitLaPaie` de Spring)."""
    jeton = get_access_token()
    return jeton is not None and "PAIE_READ" in jeton.scopes


def nombre_de(cle: str) -> Callable[[dict[str, Any]], int | None]:
    def compter(resultat: dict[str, Any]) -> int | None:
        valeurs = resultat.get(cle)
        return len(cast(list[Any], valeurs)) if isinstance(valeurs, list) else None

    return compter


def nombre_de_total(resultat: dict[str, Any]) -> int | None:
    total = resultat.get("total")
    return total if isinstance(total, int) else None
