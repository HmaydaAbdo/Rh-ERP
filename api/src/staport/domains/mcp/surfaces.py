"""Surfaces A2UI des outils MCP (KAN-80) : motif officiel « schéma fixe » de CopilotKit.

Chaque outil de liste déclare lui-même, à côté du code qui construit ses lignes, les colonnes de son tableau : seules
ces colonnes sont rendues (liste blanche, jamais un champ imprévu). L'outil rend alors, avec son résultat, les
opérations A2UI v0.9 (`createSurface`, `updateComponents`, `updateDataModel`) sous la clé `a2ui_operations`, comme
le montre la documentation CopilotKit « Fixed Schema A2UI » ; le service IA les transmet à l'interface et ne montre
au modèle que le résultat d'origine, sans recopie de lignes.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

#: Identifiant du catalogue de l'ERP (catalogue de base A2UI + composants ERP), le même que côté Angular.
CATALOGUE_ERP = "staport-intelligence://a2ui/catalogue-erp"
CLE_OPERATIONS = "a2ui_operations"
#: En dessous, la liste se lit en texte : pas de tableau.
SEUIL_LIGNES = 4


@dataclass(frozen=True)
class Colonne:
    """Une colonne du tableau : `cle` est la valeur à lire dans chaque ligne (`a.b` descend d'un niveau)."""

    cle: str
    libelle: str
    format: str = "texte"  # texte, nombre, montant ou periode (catalogue ERP)
    barre: bool = False  # barre proportionnelle derrière un nombre positif


def _valeur(ligne: dict[str, Any], cle: str) -> Any:
    courant: Any = ligne
    for partie in cle.split("."):
        if not isinstance(courant, dict):
            return None
        courant = courant.get(partie)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
    return courant  # pyright: ignore[reportUnknownVariableType]


def surface(
    outil: str,
    titre: str,
    lignes: Sequence[dict[str, Any]],
    colonnes: Sequence[Colonne],
    *,
    legende: str | None = None,
    courbe: bool = False,
) -> dict[str, Any]:
    """`{"a2ui_operations": [...]}` à joindre au résultat de l'outil, ou `{}` si la liste est trop courte.

    `courbe` ajoute au-dessus du tableau une courbe des colonnes numériques, en lisant les mois de la colonne `periode`
    (les outils rendent le mois le plus récent d'abord ; la courbe se lit de gauche à droite dans le temps)."""
    if len(lignes) < SEUIL_LIGNES:
        return {}
    plates = [{c.cle: _valeur(ligne, c.cle) for c in colonnes} for ligne in lignes]
    identifiant = f"resultat-{outil.replace('_', '-')}-{uuid.uuid4().hex[:8]}"
    tableau: dict[str, Any] = {
        "id": "tableau",
        "component": "DataTable",
        "title": titre,
        "columns": [
            {"key": c.cle, "label": c.libelle, "format": c.format, **({"bar": True} if c.barre else {})}
            for c in colonnes
        ],
        "rows": {"path": "/lignes"},
    }
    if legende:
        tableau["caption"] = legende
    composants = [{**tableau, "id": "root"}]
    if courbe:
        labels = [str(ligne.get("periode")) for ligne in plates]
        series: list[dict[str, Any]] = [
            {"name": c.libelle, "values": [ligne.get(c.cle) or 0 for ligne in plates], "format": c.format}
            for c in colonnes
            if c.format in ("nombre", "montant")
        ]
        if labels != sorted(labels):
            labels.reverse()
            for serie in series:
                serie["values"].reverse()
        graphique = {"id": "graphique", "component": "Chart", "type": "line", "labels": labels, "series": series}
        composants = [{"id": "root", "component": "Column", "children": ["graphique", "tableau"]}, graphique, tableau]
    return {
        CLE_OPERATIONS: [
            {"version": "v0.9", "createSurface": {"surfaceId": identifiant, "catalogId": CATALOGUE_ERP}},
            {"version": "v0.9", "updateComponents": {"surfaceId": identifiant, "components": composants}},
            {
                "version": "v0.9",
                "updateDataModel": {"surfaceId": identifiant, "path": "/", "value": {"lignes": plates}},
            },
        ]
    }


def avec_surface(
    resultat: dict[str, Any],
    outil: str,
    titre: str,
    cle: str,
    colonnes: Sequence[Colonne],
    *,
    legende_periode: bool = False,
    courbe: bool = False,
) -> dict[str, Any]:
    """Le résultat de l'outil, avec la surface de sa liste `cle` ; `legende_periode` ajoute « Période aaaa-MM »."""
    periode = resultat.get("periode")
    legende = f"Période {periode}" if legende_periode and isinstance(periode, str) else None
    return {**resultat, **surface(outil, titre, resultat[cle], colonnes, legende=legende, courbe=courbe)}
