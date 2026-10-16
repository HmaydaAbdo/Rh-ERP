#!/bin/sh
set -eu

log_directory=/var/lib/postgresql
retention_minutes=$((90 * 24 * 60))
scheduled_hour_utc=03

purge_expired_logs() {
  echo "pgAudit CSV retention run started at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  find "$log_directory" \
    -maxdepth 1 \
    -type f \
    -name 'postgresql-*.csv*' \
    -mmin "+$retention_minutes" \
    -print \
    -delete
  echo "pgAudit CSV retention run completed at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}

seconds_until_next_run() {
  now=$(date -u +%s)
  today=$(date -u +%F)
  next_run=$(date -u -d "$today ${scheduled_hour_utc}:00:00" +%s)

  if [ "$next_run" -le "$now" ]; then
    tomorrow=$(date -u -d "$today +1 day" +%F)
    next_run=$(date -u -d "$tomorrow ${scheduled_hour_utc}:00:00" +%s)
  fi

  echo $((next_run - now))
}

while :; do
  purge_expired_logs
  delay=$(seconds_until_next_run)
  echo "Next pgAudit CSV retention run in ${delay}s (daily at ${scheduled_hour_utc}:00 UTC)"
  sleep "$delay"
done
