"""MCP : liste des outils, schémas et appels comparés entre Spring et l'API Python (transport Streamable HTTP).

Prérequis : bases remises à zéro (`reinitialiser.sh`), banc démarré. Le script crée les données d'amorce (scénario de
paie), un compte d'agent, puis interroge `/mcp` des deux côtés avec un jeton délégué.

    uv run python -m tests.differentiel.mcp
"""

import json
import sys
from typing import Any

import httpx

from .harnais import IDENTIFIANTS, MOT_DE_PASSE_TEST, URLS, Rapport, rejouer
from .scenarios_paie_sorties import _donnees

ENTETES = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def _jeton_admin(url: str) -> str:
    return httpx.post(f"{url}/auth/login", json=IDENTIFIANTS, timeout=60).json()["accessToken"]


def _amorcer_agent(url: str) -> str:
    admin = {"Authorization": f"Bearer {_jeton_admin(url)}"}
    permissions = httpx.get(f"{url}/permissions", headers=admin, timeout=60).json()
    droits = [p["id"] for p in permissions if p["code"] in {"IA_UTILISER", "PAIE_READ", "EMPLOYEE_READ"}]
    role = httpx.post(
        f"{url}/roles", headers=admin, json={"nom": "Agent MCP", "permissionIds": droits}, timeout=60
    ).json()["id"]
    httpx.post(
        f"{url}/users",
        headers=admin,
        json={
            "username": "agentmcp",
            "email": "agentmcp@example.org",
            "motDePasse": MOT_DE_PASSE_TEST,
            "roleIds": [role],
        },
        timeout=60,
    )
    jeton = httpx.post(
        f"{url}/auth/login", json={"username": "agentmcp", "password": MOT_DE_PASSE_TEST}, timeout=60
    ).json()["accessToken"]
    agent = httpx.post(f"{url}/auth/jetons/agent", headers={"Authorization": f"Bearer {jeton}"}, timeout=60)
    return agent.json()["jeton"]


def _rpc(url: str, jeton: str, methode: str, params: dict[str, Any] | None = None, identifiant: int = 1) -> Any:
    corps = {"jsonrpc": "2.0", "id": identifiant, "method": methode, "params": params or {}}
    r = httpx.post(f"{url}/mcp", headers={**ENTETES, "Authorization": f"Bearer {jeton}"}, json=corps, timeout=120)
    texte = r.text
    if "text/event-stream" in r.headers.get("content-type", ""):
        lignes = [x[5:].strip() for x in texte.splitlines() if x.startswith("data:")]
        texte = lignes[-1] if lignes else ""
    try:
        return r.status_code, json.loads(texte)
    except ValueError:
        return r.status_code, texte[:200]


def _outils(url: str, jeton: str) -> dict[str, dict[str, Any]]:
    _, corps = _rpc(url, jeton, "tools/list")
    return {t["name"]: t for t in corps["result"]["tools"]}


def _schema(outil: dict[str, Any]) -> Any:
    schema = outil.get("inputSchema", {})
    return {
        "type": schema.get("type"),
        "required": sorted(schema.get("required", [])),
        "proprietes": {k: v.get("type") or v.get("anyOf") for k, v in sorted(schema.get("properties", {}).items())},
    }


def main() -> int:
    rejouer(_donnees(), Rapport())
    jetons = {nom: _amorcer_agent(url) for nom, url in URLS.items()}
    outils = {nom: _outils(url, jetons[nom]) for nom, url in URLS.items()}
    ecarts = 0
    noms_s, noms_p = set(outils["spring"]), set(outils["python"])
    if noms_s != noms_p:
        print(f"ÉCART outils : seulement Spring {sorted(noms_s - noms_p)} · seulement Python {sorted(noms_p - noms_s)}")
        ecarts += 1
    for nom in sorted(noms_s & noms_p):
        a, b = outils["spring"][nom], outils["python"][nom]
        if _schema(a) != _schema(b):
            print(f"ÉCART schéma {nom} : spring={_schema(a)} python={_schema(b)}")
            ecarts += 1
        if a.get("description") != b.get("description"):
            print(f"ÉCART description {nom} : spring={a.get('description')!r} python={b.get('description')!r}")
            ecarts += 1
    print(f"{len(noms_s)} outils Spring, {len(noms_p)} outils Python, {ecarts} écart(s) de catalogue")
    for nom, url in URLS.items():
        statut_init, init = _rpc(
            url,
            jetons[nom],
            "initialize",
            {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "diff", "version": "1"}},
        )
        print(nom, "initialize", statut_init, json.dumps(init, ensure_ascii=False)[:300])
        sans = httpx.post(
            f"{url}/mcp", headers=ENTETES, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, timeout=60
        )
        print(nom, "sans jeton", sans.status_code, dict(sans.headers).get("www-authenticate"))
    return 1 if ecarts else 0


if __name__ == "__main__":
    sys.exit(main())
