#!/bin/sh
set -eu
umask 077

: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_DIR:=/backups}"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
workdir=$(mktemp -d "${TMPDIR:-/tmp}/rh-erp-${timestamp}.XXXXXX")
verification_dir=
plaintext_archive="$workdir/backup.tar.gz"
temporary_archive="$BACKUP_DIR/.rh-erp-${timestamp}.tar.gz.age"
final_archive="$BACKUP_DIR/rh-erp-${timestamp}.tar.gz.age"
cleanup() {
  rm -rf "$workdir"
  if [ -n "$verification_dir" ]; then
    rm -rf "$verification_dir"
  fi
  rm -f "$temporary_archive"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

echo "Creating PostgreSQL backup ${timestamp}"
pg_dumpall --globals-only --no-role-passwords > "$workdir/globals.sql"
pg_dump --format=custom --file="$workdir/database.dump" "$PGDATABASE"
pg_restore --list "$workdir/database.dump" >/dev/null
(cd "$workdir" && sha256sum globals.sql database.dump > SHA256SUMS)
tar -czf "$plaintext_archive" -C "$workdir" globals.sql database.dump SHA256SUMS
test -s "$plaintext_archive"
tar -tzf "$plaintext_archive" >/dev/null
verification_dir=$(mktemp -d "$workdir/verify.XXXXXX")
tar -xzf "$plaintext_archive" -C "$verification_dir"
(cd "$verification_dir" && sha256sum -c SHA256SUMS)
age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$temporary_archive" "$plaintext_archive"
test -s "$temporary_archive"
# Seule l'archive chiffrée quitte le tmpfs ; l'archive temporaire claire est supprimée au cleanup.
mv "$temporary_archive" "$final_archive"

cutoff=$(date -u -d "$BACKUP_RETENTION_DAYS days ago" +%s)
for archive in "$BACKUP_DIR"/rh-erp-*.tar.gz.age; do
  [ -f "$archive" ] || continue
  modified=$(stat -c %Y "$archive")
  if [ "$modified" -lt "$cutoff" ]; then
    rm -f "$archive"
  fi
done

echo "PostgreSQL backup completed: $(basename "$final_archive"); expired backups older than ${BACKUP_RETENTION_DAYS} days removed"
