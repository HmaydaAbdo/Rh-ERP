#!/bin/sh
set -eu

: "${PGHOST:=postgres}"
: "${PGPORT:=5432}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"
: "${BACKUP_TIME_UTC:=02:00}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_DIR:=/backups}"

case "$BACKUP_AGE_RECIPIENT" in
  age1*) ;;
  *) echo "BACKUP_AGE_RECIPIENT must be an age public key (age1...)" >&2; exit 2 ;;
esac

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

case "$BACKUP_TIME_UTC" in
  [0-2][0-9]:[0-5][0-9]) ;;
  *) echo "BACKUP_TIME_UTC must use HH:MM (UTC)" >&2; exit 2 ;;
esac
hour=${BACKUP_TIME_UTC%:*}
if [ "$hour" -gt 23 ] 2>/dev/null; then
  echo "BACKUP_TIME_UTC hour must be between 00 and 23" >&2
  exit 2
fi
case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2; exit 2 ;;
esac
if [ "$BACKUP_RETENTION_DAYS" -lt 1 ]; then
  echo "BACKUP_RETENTION_DAYS must be at least 1" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
# Le mode du répertoire de sauvegarde est préparé sur l'hôte (voir docs/deployment.md).
# Ne pas exécuter chmod sur un bind mount : NTFS/Docker Desktop ne garantit pas les modes POSIX.

now=$(date -u +%s)
recent_backup=false
for archive in "$BACKUP_DIR"/rh-erp-*.tar.gz.age; do
  [ -f "$archive" ] || continue
  modified=$(stat -c %Y "$archive")
  if [ $((now - modified)) -lt 86400 ]; then
    recent_backup=true
    break
  fi
done
if [ "$recent_backup" = false ]; then
  until /usr/local/bin/backup-postgres; do
    echo "PostgreSQL backup failed; retrying in one hour" >&2
    sleep 3600
  done
fi

while :; do
  now=$(date -u +%s)
  today=$(date -u +%F)
  scheduled=$(date -u -d "$today $BACKUP_TIME_UTC:00" +%s)
  if [ "$scheduled" -le "$now" ]; then
    scheduled=$(date -u -d "$today +1 day" +%F)
    scheduled=$(date -u -d "$scheduled $BACKUP_TIME_UTC:00" +%s)
  fi
  delay=$((scheduled - now))
  echo "Next PostgreSQL backup scheduled at $(date -u -d "@$scheduled" '+%Y-%m-%d %H:%M:%S UTC')"
  sleep "$delay"
  until /usr/local/bin/backup-postgres; do
    echo "PostgreSQL backup failed; retrying in one hour" >&2
    sleep 3600
  done
done
