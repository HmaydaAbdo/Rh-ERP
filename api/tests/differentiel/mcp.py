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
    droits = [p["id"] for p in permissions]
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


def _type(propriete: dict[str, Any]) -> Any:
    """Type exposé : le `null` d'un champ optionnel est une notation de Pydantic, pas une différence de contrat."""
    variantes = [v for v in propriete.get("anyOf", []) if v.get("type") != "null"]
    base = variantes[0] if variantes else propriete
    return {"type": base.get("type"), "enum": base.get("enum")}


def _schema(outil: dict[str, Any]) -> Any:
    schema = outil.get("inputSchema", {})
    return {
        "required": sorted(schema.get("required", [])),
        "proprietes": {k: _type(v) for k, v in sorted(schema.get("properties", {}).items())},
    }


def _descriptions(outil: dict[str, Any]) -> Any:
    proprietes = outil.get("inputSchema", {}).get("properties", {})
    return {k: v.get("description") for k, v in sorted(proprietes.items())}


APPELS: list[tuple[str, dict[str, Any]]] = [
    ("systeme_identite", {}),
    ("accueil_lire", {}),
    ("parametres_lire", {}),
    ("roles_lister", {}),
    ("roles_lister", {"nom": "agent", "limite": 1}),
    ("audit_rechercher", {"categorie": "OPERATION", "limite": 5}),
    ("audit_rechercher", {"entite": "Role", "entiteId": 1}),
    ("audit_rechercher", {"depuis": "pas-une-date"}),
    ("audit_historique", {"entite": "Role", "id": 1}),
    ("audit_historique", {"entite": "Utilisateur", "id": 1}),
    ("chantier_rechercher", {}),
    ("chantier_rechercher", {"recherche": "CH", "tri": "NOM", "sens": "DESC", "limite": 2}),
    ("chantier_rechercher", {"statut": "CLOTURE"}),
    ("chantier_rechercher", {"statut": "EN_COURS", "limite": 1, "page": 1}),
    ("chantier_fiche", {"id": 1}),
    ("chantier_fiche", {"id": 99999}),
    ("equipe_rechercher", {}),
    ("equipe_rechercher", {"tri": "LIBELLE", "sens": "DESC"}),
    ("equipe_fiche", {"id": 1}),
    ("equipe_fiche", {"id": 99999}),
    ("fonction_rechercher", {}),
    ("fonction_rechercher", {"sens": "DESC", "limite": 2}),
    ("fonction_fiche", {"id": 1}),
    ("fonction_fiche", {"id": 99999}),
    ("employe_fiche", {"id": 1}),
    ("employe_parcours", {"id": 1}),
    ("employes_compter", {}),
    ("employes_compter", {"statut": "SORTI"}),
    ("employes_rechercher", {"limite": 5}),
    ("employes_rechercher", {"nom": "am", "tri": "NOM", "sens": "DESC"}),
    ("employes_regrouper", {"dimension": "CHANTIER"}),
    ("employes_regrouper", {"dimension": "FONCTION", "tri": "LIBELLE"}),
    ("employes_sorties", {}),
    ("heures_supp_indicateurs", {}),
    ("heures_supp_periodes", {}),
    ("heures_supp_rechercher", {"limite": 5}),
    ("heures_supp_import_prerequis", {"periode": "2026-01", "chantierId": 1}),
    ("paie_bulletins_rechercher", {"limite": 5}),
    ("paie_bulletins_rechercher", {"tri": "SALAIRE_TOTAL", "sens": "ASC", "limite": 3}),
    ("paie_comparer", {"dimension": "CHANTIER"}),
    ("paie_comparer", {"dimension": "FONCTION", "tri": "MASSE"}),
    ("paie_evolution", {}),
    ("paie_indicateurs", {}),
    ("paie_mouvements", {}),
    ("paie_periodes", {}),
    ("paie_qualite", {}),
    ("paie_repartition", {"dimension": "EQUIPE", "tri": "CODE"}),
    ("paie_repartition", {"dimension": "CHANTIER"}),
    ("rapport_preparer", {}),
]
VOLATILES = {"horodatage", "debut", "fin", "date", "dateHeure"}


def _normaliser(valeur: Any) -> Any:
    if isinstance(valeur, dict):
        return {k: ("<instant>" if k in VOLATILES else _normaliser(v)) for k, v in valeur.items()}
    if isinstance(valeur, list):
        return [_normaliser(v) for v in valeur]
    return valeur


def _appel(url: str, jeton: str, outil: str, arguments: dict[str, Any]) -> Any:
    statut, corps = _rpc(url, jeton, "tools/call", {"name": outil, "arguments": arguments})
    if not isinstance(corps, dict):
        return {"statut": statut, "corps": corps}
    resultat = corps.get("result")
    if resultat is None:
        return {"statut": statut, "erreur_rpc": corps.get("error", {}).get("code")}
    donnees = resultat.get("structuredContent")
    if donnees is None:
        texte = "".join(c.get("text", "") for c in resultat.get("content", []))
        try:
            donnees = json.loads(texte)
        except ValueError:
            donnees = texte
    if outil == "audit_rechercher" and isinstance(donnees, dict):  # l'historique du journal diffère d'un banc à l'autre
        for entree in donnees.get("entrees", []):
            entree.pop("id", None)
    return {"erreur": bool(resultat.get("isError")), "donnees": _normaliser(donnees)}


def _differences(a: Any, b: Any, chemin: str = "$") -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        sortie = []
        for cle in sorted(set(a) | set(b)):
            if cle not in a or cle not in b:
                sortie.append(f"{chemin}.{cle} : seulement {'spring' if cle in a else 'python'}")
            else:
                sortie += _differences(a[cle], b[cle], f"{chemin}.{cle}")
        return sortie
    if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        return [d for i, (x, y) in enumerate(zip(a, b, strict=True)) for d in _differences(x, y, f"{chemin}[{i}]")]
    return [] if a == b else [f"{chemin} : spring={str(a)[:120]!r} python={str(b)[:120]!r}"]


def comparer_appels(jetons: dict[str, str]) -> int:
    ecarts = textes = 0
    for outil, arguments in APPELS:
        a = _appel(URLS["spring"], jetons["spring"], outil, arguments)
        b = _appel(URLS["python"], jetons["python"], outil, arguments)
        if a.get("erreur") and b.get("erreur"):
            if a != b:
                textes += 1
            continue
        if a != b:
            ecarts += 1
            print(f"ÉCART appel {outil} {arguments}")
            for ligne in _differences(a, b)[:8]:
                print("   ", ligne)
    print(
        f"{len(APPELS)} appels comparés, {ecarts} écart(s), {textes} texte(s) d'erreur différent(s) (statut identique)"
    )
    return ecarts


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
        if _descriptions(a) != _descriptions(b):
            for cle in sorted(set(_descriptions(a)) | set(_descriptions(b))):
                x, y = _descriptions(a).get(cle), _descriptions(b).get(cle)
                if x != y:
                    print(f"ÉCART paramètre {nom}.{cle} : spring={x!r} python={y!r}")
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
    ecarts += comparer_appels(jetons)
    return 1 if ecarts else 0


if __name__ == "__main__":
    sys.exit(main())
