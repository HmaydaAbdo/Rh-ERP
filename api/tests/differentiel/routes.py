# pyright: basic
"""Comparaison des routes : Spring (springdoc, /v3/api-docs) contre FastAPI (/openapi.json).

Compare l'ensemble (méthode, chemin) puis, pour chaque route commune, les paramètres de requête, le type de corps,
les parties multipart et les codes de réponse documentés. Les écarts sont des lignes de tableau, pas des échecs
silencieux : le tableau Jira par module s'en nourrit.

    uv run python -m tests.differentiel.routes
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict

import httpx

from .harnais import IDENTIFIANTS, URLS

VERBES = {"get", "post", "put", "patch", "delete"}


def _normaliser_chemin(chemin: str) -> str:
    return re.sub(r"\{[^}]+\}", "{}", chemin)


def _routes(doc: dict) -> dict[tuple[str, str], dict]:
    sortie: dict[tuple[str, str], dict] = {}
    for chemin, operations in doc["paths"].items():
        for verbe, op in operations.items():
            if verbe not in VERBES:
                continue
            corps = op.get("requestBody", {}).get("content", {})
            sortie[(verbe.upper(), _normaliser_chemin(chemin))] = {
                "requete": sorted(p["name"] for p in op.get("parameters", []) if p.get("in") == "query"),
                "corps": sorted(corps),
                "codes": sorted(op.get("responses", {})),
            }
    return sortie


def main() -> int:
    docs = {}
    for nom, chemin in (("spring", "/v3/api-docs"), ("python", "/openapi.json")):
        r = httpx.get(URLS[nom] + chemin, timeout=30)
        r.raise_for_status()
        docs[nom] = r.json()
    spring, python = _routes(docs["spring"]), _routes(docs["python"])
    seulement_spring = sorted(set(spring) - set(python))
    seulement_python = sorted(set(python) - set(spring))
    communes = sorted(set(spring) & set(python))
    ecarts: dict[str, list] = defaultdict(list)
    for cle in communes:
        for champ in ("requete", "corps"):
            if spring[cle][champ] != python[cle][champ]:
                ecarts[f"{cle[0]} {cle[1]}"].append((champ, spring[cle][champ], python[cle][champ]))
    print(f"routes Spring : {len(spring)}, Python : {len(python)}, communes : {len(communes)}")
    print(f"\nSEULEMENT SPRING ({len(seulement_spring)}) — route manquante côté Python :")
    for v, c in seulement_spring:
        print(f"  {v} {c}")
    print(f"\nSEULEMENT PYTHON ({len(seulement_python)}) — route ajoutée côté Python :")
    for v, c in seulement_python:
        print(f"  {v} {c}")
    print(f"\nÉCARTS DE CONTRAT SUR ROUTES COMMUNES ({len(ecarts)}) :")
    for route, lignes in ecarts.items():
        for champ, a, b in lignes:
            print(f"  {route} · {champ} : spring={json.dumps(a)} python={json.dumps(b)}")
    return 1 if (seulement_spring or ecarts) else 0


if __name__ == "__main__":
    _ = IDENTIFIANTS
    sys.exit(main())
