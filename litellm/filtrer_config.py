"""Retire de la configuration LiteLLM les déploiements dont la clé n'est pas renseignée.

Une clé vide donne une 401, et LiteLLM v1.104.2 ne bascule pas sur une erreur d'authentification : la question
échoue au lieu de passer au modèle suivant du même groupe (mesuré par l'évaluation T6). Seuls les identifiants des
déploiements retirés sont affichés, jamais une valeur.

  python3 filtrer_config.py <source.yaml> <cible.yaml>
"""

import os
import sys

import yaml


def cle_absente(deploiement: dict) -> bool:
    cle = str((deploiement.get("litellm_params") or {}).get("api_key", ""))
    return cle.startswith("os.environ/") and not os.environ.get(cle.removeprefix("os.environ/"), "").strip()


def main(source: str, cible: str) -> None:
    with open(source, encoding="utf-8") as fichier:
        config = yaml.safe_load(fichier)
    retires = [d for d in config.get("model_list", []) if cle_absente(d)]
    config["model_list"] = [d for d in config.get("model_list", []) if not cle_absente(d)]
    for deploiement in retires:
        identifiant = (deploiement.get("model_info") or {}).get("id", deploiement.get("model_name"))
        print(f"erp-rh-litellm : {identifiant} désactivé (clé absente)", file=sys.stderr)
    if not config["model_list"]:
        sys.exit("erp-rh-litellm : aucune clé de fournisseur renseignée")
    with open(cible, "w", encoding="utf-8") as fichier:
        yaml.safe_dump(config, fichier, allow_unicode=True, sort_keys=False)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
