#!/bin/sh
# Entrée de l'image API : applique les migrations Alembic avec le compte propriétaire du schéma, puis lance le serveur.
# Les identifiants propriétaire sont retirés de l'environnement avant le lancement du serveur : le processus qui sert les
# requêtes ne les possède pas. Une migration en échec arrête le conteneur (le serveur ne démarre jamais sur un schéma
# incohérent) ; Compose le relance et le journal indique la cause.
set -eu

if [ -n "${DB_MIGRATION_PASSWORD:-}" ]; then
  python -m staport.migrations.deploiement
fi
unset DB_MIGRATION_USER DB_MIGRATION_PASSWORD
exec "$@"
