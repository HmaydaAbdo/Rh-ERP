FROM postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873

RUN apk add --no-cache age coreutils findutils tar gzip \
    && mkdir -p /backups \
    && chown postgres:postgres /backups

COPY --chmod=0755 backup-postgres.sh /usr/local/bin/backup-postgres
COPY --chmod=0755 backup-scheduler.sh /usr/local/bin/backup-scheduler

USER postgres
ENTRYPOINT ["/usr/local/bin/backup-scheduler"]
