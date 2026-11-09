FROM postgres:18-alpine@sha256:123b17998ccaf47e53b502e8c6a1e79afd8f579c6f3eec83c563da026f957395

RUN apk add --no-cache age coreutils findutils tar gzip \
    && mkdir -p /backups \
    && chown postgres:postgres /backups

COPY --chmod=0755 backup-postgres.sh /usr/local/bin/backup-postgres
COPY --chmod=0755 backup-scheduler.sh /usr/local/bin/backup-scheduler

USER postgres
ENTRYPOINT ["/usr/local/bin/backup-scheduler"]
