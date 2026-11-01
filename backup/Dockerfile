FROM postgres:18-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5

RUN apk add --no-cache age coreutils findutils tar gzip \
    && mkdir -p /backups \
    && chown postgres:postgres /backups

COPY --chmod=0755 backup-postgres.sh /usr/local/bin/backup-postgres
COPY --chmod=0755 backup-scheduler.sh /usr/local/bin/backup-scheduler

USER postgres
ENTRYPOINT ["/usr/local/bin/backup-scheduler"]
