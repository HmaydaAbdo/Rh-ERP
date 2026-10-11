#!/bin/sh
set -eu
umask 077

: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_DIR:=/backups}"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
workdir=$(mktemp -d "$BACKUP_DIR/.rh-erp-${timestamp}.XXXXXX")
temporary_archive="$BACKUP_DIR/.rh-erp-${timestamp}.tar.gz"
final_archive="$BACKUP_DIR/rh-erp-${timestamp}.tar.gz"
cleanup() {
  rm -rf "$workdir"
  rm -f "$temporary_archive"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

echo "Creating PostgreSQL backup ${timestamp}"
pg_dumpall --globals-only --no-role-passwords > "$workdir/globals.sql"
pg_dump --format=custom --file="$workdir/database.dump" "$PGDATABASE"
pg_restore --list "$workdir/database.dump" >/dev/null
(cd "$workdir" && sha256sum globals.sql database.dump > SHA256SUMS)
tar -czf "$temporary_archive" -C "$workdir" globals.sql database.dump SHA256SUMS
# umask 077 protège déjà l'archive à sa création, y compris sur les bind mounts sans chmod POSIX.
mv "$temporary_archive" "$final_archive"

cutoff=$(date -u -d "$BACKUP_RETENTION_DAYS days ago" +%s)
for archive in "$BACKUP_DIR"/rh-erp-*.tar.gz; do
  [ -f "$archive" ] || continue
  modified=$(stat -c %Y "$archive")
  if [ "$modified" -lt "$cutoff" ]; then
    rm -f "$archive"
  fi
done

echo "PostgreSQL backup completed: $(basename "$final_archive"); expired backups older than ${BACKUP_RETENTION_DAYS} days removed"
