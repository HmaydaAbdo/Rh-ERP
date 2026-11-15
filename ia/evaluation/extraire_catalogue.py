"""Extrait le catalogue MCP (nom, titre, description) des outils Python de l'API : entrée de l'évaluation du routage.

Lit par ``ast`` les décorateurs ``@serveur.tool(name=..., title=..., description=...)`` de
``api/src/staport/domains/mcp/outils*.py``, sans importer l'API.

Usage, depuis ia/ : ``python evaluation/extraire_catalogue.py evaluation/catalogue_mcp.json``. À relancer à chaque
changement d'une définition d'outil (site/docs/ia, T32).
"""

import ast
import json
import re
import sys
from pathlib import Path

DOSSIER_OUTILS = Path(__file__).resolve().parents[2] / "api" / "src" / "staport" / "domains" / "mcp"


def _outils_du_module(chemin: Path) -> list[dict[str, str]]:
    """Les outils déclarés dans un module, dans l'ordre du source."""
    arbre = ast.parse(chemin.read_text(encoding="utf-8"))
    trouves: list[tuple[int, dict[str, str]]] = []
    for noeud in ast.walk(arbre):
        if not isinstance(noeud, ast.Call):
            continue
        fonction = noeud.func
        if not (isinstance(fonction, ast.Attribute) and fonction.attr == "tool"):
            continue
        champs = {mot.arg: ast.literal_eval(mot.value) for mot in noeud.keywords if mot.arg in {"name", "title", "description"}}
        if "name" not in champs:
            continue
        description = re.sub(r"\s+", " ", str(champs.get("description", ""))).strip()
        trouves.append(
            (noeud.lineno, {"name": str(champs["name"]), "title": str(champs.get("title", "")), "description": description})
        )
    return [outil for _, outil in sorted(trouves, key=lambda t: t[0])]


def extraire() -> list[dict[str, str]]:
    sortie: list[dict[str, str]] = []
    for chemin in sorted(DOSSIER_OUTILS.glob("outils*.py")):
        sortie.extend(_outils_du_module(chemin))
    return sortie


if __name__ == "__main__":
    catalogue = extraire()
    print(len(catalogue), "outils")
    Path(sys.argv[1]).write_text(json.dumps(catalogue, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
