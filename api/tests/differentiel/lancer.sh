#!/usr/bin/env bash
# Rejoue tous les scénarios : bases remises à zéro avant chaque fichier de scénarios.
# Usage : bash lancer.sh   (depuis api/tests/differentiel, banc déjà construit)
set -uo pipefail
cd "$(dirname "$0")/../.."
code=0
for fichier in tests/differentiel/scenarios_*.py; do
  module=$(basename "$fichier" .py)
  bash tests/differentiel/reinitialiser.sh >/dev/null || exit 1
  echo "=== $module"
  uv run python -W ignore -m tests.differentiel.run "$module" || code=1
done
exit $code
