# Validation de l'historique Flyway avant la bascule Alembic (KAN-219).
# Image officielle OSS, dernière version stable au 2026-11-06.
FROM flyway/flyway:13.12.1@sha256:3b4fae57858ee25735230e42f426fd200144fedbe692ea7789aa3e50a7c11657

COPY --chown=10001:10001 src/staport/migrations/flyway_v44/ /flyway/sql/
USER 10001:10001
