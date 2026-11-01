# Image erp-rh-ia : service IA Python. Bases épinglées par version et digest.
FROM ghcr.io/astral-sh/uv:0.13.6@sha256:af22a52f5eafef3d78e551599d405c02df61919d18028f0cea8eda93bc9986d0 AS uv

FROM python:3.14-slim@sha256:cd89c30eda26ee911a4611b18680086e0ea42e6f5f8cbe653d07fa7958c9cec8 AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Dépendances d'abord (couche réutilisée tant que le lockfile ne change pas), sans outils de développement.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

FROM python:3.14-slim@sha256:cd89c30eda26ee911a4611b18680086e0ea42e6f5f8cbe653d07fa7958c9cec8
RUN groupadd --system --gid 10001 ia && useradd --system --uid 10001 --gid ia --no-create-home ia
COPY --from=build --chown=root:root /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
# Traces OpenTelemetry (docs/ia.md, T18) : lancées par l'auto-instrumentation officielle (FastAPI, httpx, LangChain par
# OpenInference), coupées tant que Compose ne les active pas (OTEL_SDK_DISABLED=false et l'adresse de Phoenix).
ENV OTEL_SDK_DISABLED=true OTEL_TRACES_EXPORTER=otlp OTEL_METRICS_EXPORTER=none OTEL_LOGS_EXPORTER=none OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
USER 10001:10001
EXPOSE 8000
# Premier démarrage d'une image neuve : l'import du SDK litellm (via langchain-litellm) et des dépendances LangChain lit
# des milliers de fichiers ; mesuré à 110 s à froid sur Docker Desktop (27 s ensuite). La fenêtre couvre ce cas sans
# ralentir les autres démarrages : un essai toutes les 3 s, sain dès la première réponse.
HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --start-interval=3s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]
ENTRYPOINT ["opentelemetry-instrument", "python", "-m", "erp_rh_ia"]
