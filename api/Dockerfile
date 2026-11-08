# Image erp-rh-api : API unique FastAPI (ADR 0016), qui porte aussi le serveur MCP de l'assistant (/mcp). Bases épinglées
# par version et digest, comme l'image du service IA.
FROM ghcr.io/astral-sh/uv:0.13.7@sha256:96f40d3904aad8d0bd010539001d36c8e2188b981e1334471a90c4a1d93bb490 AS uv

FROM python:3.14-slim@sha256:930e1abba7c4e8f96ed93e8012c35d174d7732752731bbd5e8e757d7ec6f3966 AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0 libharfbuzz-subset0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/api
# Dépendances d'abord (couche réutilisée tant que le lockfile ne change pas), sans outils de développement.
COPY api/pyproject.toml api/uv.lock ./
COPY ia/pyproject.toml /app/ia/pyproject.toml
COPY ia/src/ /app/ia/src/
RUN uv sync --locked --no-dev --no-install-project
COPY api/src ./src
RUN uv sync --locked --no-dev --no-editable

FROM python:3.14-slim@sha256:930e1abba7c4e8f96ed93e8012c35d174d7732752731bbd5e8e757d7ec6f3966
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0 libharfbuzz-subset0 \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 10001 api && useradd --system --uid 10001 --gid api --no-create-home api
COPY --from=build --chown=root:root /app/api/.venv /app/api/.venv
# Étape de migration du déploiement : `alembic upgrade head` avec le compte propriétaire (jamais dans le lifespan).
COPY --chown=root:root api/alembic.ini /app/alembic.ini
WORKDIR /app
ENV PATH="/app/api/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 XDG_CACHE_HOME=/tmp MPLCONFIGDIR=/tmp/matplotlib
# Traces OpenTelemetry (site/docs/ia, T18) : auto-instrumentation FastAPI et spans d'outils MCP.
# Les spans SQL utilisent l'instrumentation Psycopg 3 ; l'instrumentation SQLAlchemy 0.66b2 exclut SQLAlchemy 2.1.
# Coupées tant que Compose ne les active pas. Les sondes de santé ne sont pas tracées.
ENV OTEL_SDK_DISABLED=true OTEL_TRACES_EXPORTER=otlp OTEL_METRICS_EXPORTER=none OTEL_LOGS_EXPORTER=none \
    OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf OTEL_PYTHON_FASTAPI_EXCLUDED_URLS=health
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4)"]
# L'adresse IP du client (audit) vient de `X-Forwarded-For`, posé par nginx et honoré des seuls proxys internes (réseaux
# privés de Docker et boucle locale), comme `server.forward-headers-strategy: native` de l'ancien backend.
ENTRYPOINT ["opentelemetry-instrument", "uvicorn", "staport.main:application", "--factory", "--host", "0.0.0.0", "--port", "8080", \
  "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"]
