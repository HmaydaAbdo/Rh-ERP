#!/bin/sh
# Refuse de démarrer sans les secrets obligatoires : sans clé master, LiteLLM accepterait des appels
# anonymes ; sans base, les clés virtuelles et budgets ne seraient pas appliqués.
set -eu

case "${LITELLM_MASTER_KEY:-}" in
  sk-?*) ;;
  *) echo "LITELLM_MASTER_KEY est obligatoire et doit commencer par sk-" >&2; exit 1 ;;
esac
: "${LITELLM_SALT_KEY:?LITELLM_SALT_KEY est obligatoire}"
: "${DATABASE_URL:?DATABASE_URL est obligatoire}"

# Configuration effective : sans les déploiements dont la clé est vide (litellm/filtrer_config.py).
python3 /usr/local/bin/erp-rh-filtrer-config /app/config.yaml /tmp/config.yaml

exec docker/prod_entrypoint.sh "$@"
