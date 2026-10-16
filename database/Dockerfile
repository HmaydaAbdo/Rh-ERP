FROM pgvector/pgvector:0.8.7-pg18 AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates git libkrb5-dev postgresql-server-dev-18 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch 18.0 https://github.com/pgaudit/pgaudit.git /tmp/pgaudit \
    && make -C /tmp/pgaudit USE_PGXS=1 install \
    && rm -rf /tmp/pgaudit

FROM pgvector/pgvector:0.8.7-pg18

RUN apt-get update \
    && apt-get install -y --no-install-recommends findutils \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/lib/postgresql/18/lib/pgaudit.so /usr/lib/postgresql/18/lib/pgaudit.so
COPY --from=build /usr/share/postgresql/18/extension/pgaudit* /usr/share/postgresql/18/extension/
COPY --chmod=0755 pgaudit-retention-scheduler.sh /usr/local/bin/pgaudit-retention-scheduler
