#!/usr/bin/env python3
"""Enregistre dans la passerelle les clés virtuelles dont la valeur est déjà dans le .env racine.

  python litellm/enregistrer_cles.py

- IA_LITELLM_API_KEY  -> clé « erp-rh-ia » : cinq groupes de production uniquement, 60 requêtes/min,
  8 simultanées, 300 000 jetons/min.
- LITELLM_TEST_API_KEY -> clé « smoke-tests » : groupes de production, évaluation et tests (test_providers.py).

Idempotent : les groupes autorisés des clés existantes sont synchronisés. Utilise LITELLM_MASTER_KEY, sans jamais afficher de
clé. Bibliothèque standard Python uniquement.
"""
import json
import os
import re
from pathlib import Path
import sys
import urllib.error
import urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(os.path.dirname(ICI), ".env")

CONFIG = Path(__file__).with_name("litellm_config.yaml")
if not CONFIG.exists():
    CONFIG = Path("/app/config.yaml")
GROUPES = sorted(set(re.findall(r"^  - model_name: (\S+)", CONFIG.read_text(encoding="utf-8"), re.M)))
PRODUCTION = ["ai-gateway-" + c for c in ("simple", "tool-selection", "medium", "complex", "code", "ocr")]
CLES = [
    ("IA_LITELLM_API_KEY", {"key_alias": "erp-rh-ia", "models": PRODUCTION, "rpm_limit": 60,
                            "max_parallel_requests": 8, "tpm_limit": 300000}),
    ("LITELLM_TEST_API_KEY", {"key_alias": "smoke-tests", "models": GROUPES}),
]


def lire_env():
    """Le .env racine, puis les variables d'environnement du processus, qui priment."""
    valeurs = {}
    try:
        with open(ENV, encoding="utf-8") as fichier:
            for ligne in fichier:
                ligne = ligne.strip()
                if ligne and not ligne.startswith("#") and "=" in ligne:
                    nom, valeur = ligne.split("=", 1)
                    valeurs[nom.strip()] = valeur.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    utiles = {"LITELLM_MASTER_KEY", "LITELLM_GATEWAY_URL"} | {variable for variable, _ in CLES}
    return {**valeurs, **{k: v for k, v in os.environ.items() if k in utiles}}


def appeler(base, maitre, chemin, corps=None):
    donnees = None if corps is None else json.dumps(corps).encode("utf-8")
    requete = urllib.request.Request(base + chemin, data=donnees, headers={
        "Authorization": f"Bearer {maitre}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(requete, timeout=30) as reponse:
            return reponse.status, json.loads(reponse.read() or b"{}")
    except urllib.error.HTTPError as erreur:
        return erreur.code, {"erreur": erreur.read().decode("utf-8", "replace")[:300]}


def main():
    env = lire_env()
    maitre = env.get("LITELLM_MASTER_KEY", "")
    if not maitre.startswith("sk-"):
        sys.exit("LITELLM_MASTER_KEY absente du .env racine")
    base = env.get("LITELLM_GATEWAY_URL", "http://127.0.0.1:4000/v1/chat/completions").split("/v1/", 1)[0]
    echec = False
    for variable, definition in CLES:
        cle = env.get(variable, "")
        if not cle.startswith("sk-"):
            print(f"[IGNORÉE] {variable} vide dans le .env")
            continue
        statut, info = appeler(base, maitre, "/key/info?key=" + urllib.request.quote(cle))
        if statut == 200:
            if sorted(info.get("info", {}).get("models", [])) == sorted(definition["models"]):
                print(f"[DÉJÀ]    {definition['key_alias']} ({variable})")
                continue
            statut, reponse = appeler(base, maitre, "/key/update", {"key": cle, "models": definition["models"]})
            if statut == 200:
                print(f"[SYNCHRO] {definition['key_alias']} : groupes autorisés actualisés")
            else:
                echec = True
                print(f"[ÉCHEC]   {definition['key_alias']} : HTTP {statut}")
            continue
        statut, reponse = appeler(base, maitre, "/key/generate", {**definition, "key": cle})
        if statut == 200:
            print(f"[CRÉÉE]   {definition['key_alias']} ({variable})")
        else:
            echec = True
            print(f"[ÉCHEC]   {definition['key_alias']} : HTTP {statut} {str(reponse).replace(cle, '<clé>')}")
    sys.exit(1 if echec else 0)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
