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

# Clés virtuelles du .env (IA_LITELLM_API_KEY, LITELLM_TEST_API_KEY) : enregistrées par ce conteneur dès que la passerelle
# répond, de façon idempotente, sans conteneur ponctuel à part. Quelques essais, puis abandon (le journal l'indique).
enregistrer_cles() {
  essai=0
  until python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/health/readiness', timeout=5)" 2>/dev/null; do
    sleep 3
  done
  while [ "$essai" -lt 5 ]; do
    python3 /usr/local/bin/staport-intelligence-enregistrer-cles && return 0
    essai=$((essai + 1))
    sleep 5
  done
  echo "Enregistrement des clés virtuelles impossible après 5 essais" >&2
}
enregistrer_cles &

# Les modèles sans clé sont écartés par les sondes natives de LiteLLM (litellm_config.yaml, general_settings).
exec docker/prod_entrypoint.sh "$@"
