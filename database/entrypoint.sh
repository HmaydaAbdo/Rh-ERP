#!/bin/sh
# Entrée de l'image PostgreSQL de Staport Intelligence : lance l'entrée officielle, et pendant qu'elle démarre le serveur,
# crée de façon idempotente un compte et une base par service (phoenix, litellm, ia), chacun fermé aux autres comptes.
# Un seul conteneur PostgreSQL, aucun conteneur d'initialisation à part. Le serveur n'est « sain » qu'une fois les bases créées
# (healthcheck du service postgres dans docker-compose.yml).
set -eu

creer_bases() {
  # TCP seulement : le serveur temporaire d'initdb n'écoute que sur son socket (conventions/lecons.md).
  until pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -q; do sleep 2; done
  export PGHOST=127.0.0.1 PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"
  for entree in phoenix:PHOENIX_DB_PASSWORD litellm:LITELLM_DB_PASSWORD ia:IA_DB_PASSWORD; do
    nom="${entree%%:*}"
    eval "mdp=\${${entree#*:}:-}"
    if [ -z "$mdp" ]; then
      echo "base $nom : ${entree#*:} absent, base non créée" >&2
      continue
    fi
    psql -v ON_ERROR_STOP=1 -v nom="$nom" -v mdp="$mdp" -q <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'nom', :'mdp')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'nom') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'nom', :'mdp') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'nom', :'nom')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'nom') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'nom') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'nom', :'nom') \gexec
SQL
  done
}

creer_bases &
exec docker-entrypoint.sh "$@"
