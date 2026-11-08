#!/usr/bin/env bash
# Remet les deux bases à l'état vierge (schéma V44 + compte admin) : chaque exécution du harnais part du même état.
# Usage : bash reinitialiser.sh   (depuis api/tests/differentiel, banc déjà construit)
set -euo pipefail
cd "$(dirname "$0")"
docker compose --env-file .env.cles down -v --remove-orphans >/dev/null 2>&1
docker compose --env-file .env.cles up -d >/dev/null 2>&1
for _ in $(seq 1 60); do
  a=$(curl -s -o /dev/null -w '%{http_code}' localhost:8081/actuator/health || true)
  b=$(curl -s -o /dev/null -w '%{http_code}' localhost:8082/health || true)
  [ "$a$b" = "200200" ] && echo "banc prêt (spring=$a python=$b)" && exit 0
  sleep 3
done
echo "banc non prêt (spring=$a python=$b)" >&2
exit 1
