FROM pgvector/pgvector:0.8.7-pg18 AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates git libkrb5-dev postgresql-server-dev-18 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch REL_18_STABLE https://github.com/pgaudit/pgaudit.git /tmp/pgaudit \
    && make -C /tmp/pgaudit USE_PGXS=1 install \
    && rm -rf /tmp/pgaudit

FROM pgvector/pgvector:0.8.7-pg18

COPY --from=build /usr/lib/postgresql/18/lib/pgaudit.so /usr/lib/postgresql/18/lib/pgaudit.so
COPY --from=build /usr/share/postgresql/18/extension/pgaudit* /usr/share/postgresql/18/extension/
