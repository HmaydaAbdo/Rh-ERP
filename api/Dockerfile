# Image erp-rh-api : API unique FastAPI (ADR 0016), qui porte aussi le serveur MCP de l'assistant (/mcp). Bases épinglées
# par version et digest, comme l'image du service IA.
FROM ghcr.io/astral-sh/uv:0.13.7@sha256:96f40d3904aad8d0bd010539001d36c8e2188b981e1334471a90c4a1d93bb490 AS uv

FROM python:3.14-slim@sha256:930e1abba7c4e8f96ed93e8012c35d174d7732752731bbd5e8e757d7ec6f3966 AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Dépendances d'abord (couche réutilisée tant que le lockfile ne change pas), sans outils de développement.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

FROM python:3.14-slim@sha256:930e1abba7c4e8f96ed93e8012c35d174d7732752731bbd5e8e757d7ec6f3966
RUN groupadd --system --gid 10001 api && useradd --system --uid 10001 --gid api --no-create-home api
COPY --from=build --chown=root:root /app/.venv /app/.venv
# Étape de migration du déploiement : `alembic upgrade head` avec le compte propriétaire (jamais dans le lifespan).
COPY --chown=root:root alembic.ini /app/alembic.ini
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
# Traces OpenTelemetry (docs/ia.md, T18) : auto-instrumentation officielle (FastAPI, SQLAlchemy) ; les spans d'outils MCP
# s'y ajoutent. Coupées tant que Compose ne les active pas (OTEL_SDK_DISABLED=false et l'adresse de Phoenix). Les sondes
# de santé ne sont pas tracées.
ENV OTEL_SDK_DISABLED=true OTEL_TRACES_EXPORTER=otlp OTEL_METRICS_EXPORTER=none OTEL_LOGS_EXPORTER=none \
    OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf OTEL_PYTHON_FASTAPI_EXCLUDED_URLS=health
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4)"]
ENTRYPOINT ["opentelemetry-instrument", "uvicorn", "staport.main:application", "--factory", "--host", "0.0.0.0", "--port", "8080"]
