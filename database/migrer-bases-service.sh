#!/bin/sh
# Migration ponctuelle (anciennes installations) : reprend les bases des anciens conteneurs `litellm-db` et `ia-db` dans le
# PostgreSQL de l'ERP, qui héberge désormais les bases `litellm` et `ia` (une seule instance, une seule persistance).
#
# À lancer depuis la racine du dépôt, AVANT `docker compose pull && docker compose up -d` avec le nouveau docker-compose.yml,
# alors que les anciens conteneurs tournent encore :
#
#   sh database/migrer-bases-service.sh sauvegarder   # dumps dans ./migration-bases/ (ne modifie rien)
#   docker compose pull && docker compose up -d       # nouvelle pile : postgres crée les bases vides litellm et ia
#   sh database/migrer-bases-service.sh restaurer     # recharge les dumps dans les nouvelles bases
#   docker compose restart litellm ia
#
# Les anciens volumes (litellm_db_data, ia_db_data) ne sont pas supprimés : ne les retirer qu'après vérification.
set -eu

dossier=migration-bases
etape="${1:-}"

case "$etape" in
  sauvegarder)
    mkdir -p "$dossier"
    for ancien in litellm ia; do
      docker exec "${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}-$ancien-db-1" \
        pg_dump -U "$ancien" -d "$ancien" --format=custom --no-owner > "$dossier/$ancien.dump"
      docker run --rm -i --entrypoint pg_restore "$(docker inspect -f '{{.Config.Image}}' \
        "${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}-$ancien-db-1")" --list < "$dossier/$ancien.dump" > /dev/null
      echo "$ancien : sauvegarde vérifiée ($dossier/$ancien.dump)"
    done
    ;;
  restaurer)
    for base in litellm ia; do
      [ -s "$dossier/$base.dump" ] || { echo "$dossier/$base.dump absent : lancer d'abord « sauvegarder »" >&2; exit 1; }
      docker compose exec -T postgres sh -c \
        "PGPASSWORD=\$POSTGRES_PASSWORD pg_restore -h 127.0.0.1 -U \$POSTGRES_USER -d $base --no-owner --role=$base --clean --if-exists" \
        < "$dossier/$base.dump"
      echo "$base : restaurée dans le PostgreSQL de l'ERP"
    done
    ;;
  *)
    echo "usage : sh database/migrer-bases-service.sh sauvegarder|restaurer" >&2
    exit 2
    ;;
esac
