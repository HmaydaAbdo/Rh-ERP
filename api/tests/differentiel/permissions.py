# pyright: basic
"""Matrice route par route des permissions : `@PreAuthorize` de Spring contre `exiger(...)` de l'API Python.

Comparaison statique (sources Java du tag java-final, application FastAPI construite sans base) : chaque route doit
exiger exactement les mêmes autorités, `et` entre les conditions, `ou` à l'intérieur de `hasAnyAuthority`.

    uv run python -m tests.differentiel.permissions [chemin des sources Java]
"""

import re
import sys
from pathlib import Path

from fastapi.routing import APIRoute

from staport.domains.accueil import router as routes_accueil
from staport.domains.audit import router as routes_audit
from staport.domains.auth import router as routes_auth
from staport.domains.chantier import router as routes_chantier
from staport.domains.employee import router as routes_employee
from staport.domains.equipe import router as routes_equipe
from staport.domains.function import router as routes_function
from staport.domains.heuresupp import router as routes_heuresupp
from staport.domains.paie import router as routes_paie
from staport.domains.parametre import router as routes_parametre

SOURCES = Path("../../spring-ref/backend/src/main/java/staport/rh")
VERBES = {"Get": "GET", "Post": "POST", "Put": "PUT", "Delete": "DELETE", "Patch": "PATCH"}


def _normaliser_chemin(chemin: str) -> str:
    chemin = re.sub(r"\{[^}]+\}", "{}", chemin)
    return chemin.rstrip("/") or "/"


def _autorites(expression: str) -> frozenset[frozenset[str]]:
    conditions = set()
    for condition in re.split(r"\s+and\s+", expression):
        conditions.add(frozenset(re.findall(r"'([A-Z_]+)'", condition)))
    return frozenset(conditions)


def spring(racine: Path) -> dict[tuple[str, str], frozenset[frozenset[str]]]:
    sortie: dict[tuple[str, str], frozenset[frozenset[str]]] = {}
    for fichier in racine.rglob("*.java"):
        texte = fichier.read_text(encoding="utf-8")
        if "@RestController" not in texte:
            continue
        entete = texte.split("public class", 1)[0] if "public class" in texte else texte
        prefixe_m = re.search(r'@RequestMapping\("([^"]*)"\)', entete)
        prefixe = prefixe_m.group(1) if prefixe_m else ""
        classe_m = re.search(r'@PreAuthorize\("([^"]+)"\)', entete)
        classe = _autorites(classe_m.group(1)) if classe_m else None
        corps = texte.split("public class", 1)[1] if "public class" in texte else ""
        for bloc in re.split(r"\n(?=\s*@(?:Get|Post|Put|Delete|Patch)Mapping)", corps)[1:]:
            mapping = re.match(
                r'\s*@(Get|Post|Put|Delete|Patch)Mapping(?:\((?:value\s*=\s*)?"([^"]*)"[^)]*\)|(?:\([^"]*\))?)', bloc
            )
            if not mapping:
                continue
            avant_methode = bloc.split("public ", 1)[0]
            methode_m = re.search(r'@PreAuthorize\("([^"]+)"\)', avant_methode)
            autorites = _autorites(methode_m.group(1)) if methode_m else classe
            chemin = _normaliser_chemin(prefixe + (mapping.group(2) or ""))
            sortie[(VERBES[mapping.group(1)], chemin)] = autorites or frozenset()
    return sortie


def python() -> dict[tuple[str, str], frozenset[frozenset[str]]]:
    routes: list[APIRoute] = []
    for routeur in (
        routes_auth.auth, routes_auth.agent, routes_auth.utilisateurs, routes_auth.roles, routes_audit.logs,
        routes_parametre.parametres, routes_accueil.accueil, routes_function.fonctions, routes_equipe.equipes,
        routes_chantier.chantiers, routes_employee.employees, routes_paie.paies, routes_heuresupp.heures_supp,
        routes_heuresupp.imports,
    ):  # fmt: skip
        routes.extend(r for r in routeur.routes if isinstance(r, APIRoute))
    sortie: dict[tuple[str, str], frozenset[frozenset[str]]] = {}
    for route in routes:
        conditions: set[frozenset[str]] = set()
        pile = [d.call for d in route.dependant.dependencies]
        pile += [d.dependency for d in route.dependencies]
        sous = list(route.dependant.dependencies)
        while sous:
            courant = sous.pop()
            pile.append(courant.call)
            sous.extend(courant.dependencies)
        for appel in pile:
            if appel is not None and getattr(appel, "__name__", "") == "verifier" and appel.__closure__:
                for cellule in appel.__closure__:
                    contenu = cellule.cell_contents
                    if isinstance(contenu, tuple) and all(isinstance(x, str) for x in contenu):
                        conditions.add(frozenset(contenu))
        for methode in route.methods or ():
            sortie[(methode, _normaliser_chemin(route.path))] = frozenset(conditions)
    return sortie


def main(racine: Path) -> int:
    ref, py = spring(racine), python()
    ecarts = 0
    for cle in sorted(set(ref) | set(py)):
        a, b = ref.get(cle), py.get(cle)
        if a is None or b is None:
            print(f"ROUTE {cle} : spring={a is not None} python={b is not None}")
            ecarts += 1
        elif a != b:
            print(f"ÉCART {cle} : spring={sorted(map(sorted, a))} python={sorted(map(sorted, b))}")
            ecarts += 1
    protegees = sum(1 for v in ref.values() if v)
    print(f"{len(ref)} routes Spring ({protegees} protégées), {len(py)} routes Python, {ecarts} écart(s)")
    return 1 if ecarts else 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCES))
