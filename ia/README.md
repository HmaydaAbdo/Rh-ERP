# Service IA — image `erp-rh-ia`

Service Python d'ERP-RH : graphe LangGraph (T6), client MCP vers Spring (T3–T5), point d'entrée
AG-UI vers Angular (T7), modèles uniquement par la passerelle [LiteLLM](../litellm/README.md).
Décisions, plan et état : [docs/ia.md](../docs/ia.md). Règles : [conventions/agents-ia.md](../conventions/agents-ia.md).

## État actuel

- Santé : `GET /health` (processus vivant) et `GET /health/ready` (IA désactivée, ou passerelle
  LiteLLM joignable ; sinon `503`).
- Configuration typée (`src/erp_rh_ia/config.py`) ; le service refuse de démarrer sans
  `IA_ENABLED`, `IA_LITELLM_BASE_URL` ou `IA_LITELLM_API_KEY` (8 caractères au moins).
- Client LiteLLM : alias `ai-gateway`, tag de tâche obligatoire (`Tache`), aucune nouvelle tentative
  côté service (la passerelle bascule déjà).
- Preuve MCP : `tests/compatibilite/` rejoue contre le serveur Java les scénarios du client
  TypeScript ; lancée par `McpCompatibilityTest` (profil Maven `mcp-compatibility`).

## Développer

Prérequis : `uv` 0.12 ou plus récent (il installe Python 3.13 lui-même).

```bash
cd ia
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest -q
```

Les tests de `tests/compatibilite/` sont ignorés sans `MCP_COMPATIBILITY_URL`. Pour les exécuter
contre le serveur Java synthétique :

```bash
cd backend
./mvnw -B -P mcp-compatibility -Dtest=McpCompatibilityTest test
```

Rapport : `backend/target/mcp-compatibility/client-python.txt`.

`tests/integration/` appelle la **vraie** route `/mcp` de l'application avec un jeton agent ; lancé par
`McpClientPythonIntegrationTest` (application complète et base de test) :

```bash
cd backend
./mvnw -B -Dia.client-python=true -Dtest=McpClientPythonIntegrationTest test
```

Rapport : `backend/target/client-python-mcp-erp-rh.txt`.

## Image et exploitation

- Image multi-étapes, bases `python:3.13-slim` et `uv` épinglées par digest ; dépendances installées
  depuis `uv.lock` sans outils de développement ; utilisateur non privilégié `10001`.
- Service Compose `ia` sous le profil `ia`, système de fichiers en lecture seule, aucune capacité,
  port `127.0.0.1:${IA_PORT}` (5003 par défaut).
- Variables dans le `.env` racine unique : `IA_ENABLED`, `IA_LITELLM_API_KEY` (clé virtuelle
  ERP-RH, `metadata.tags: ["!eval"]`) ; l'URL de la passerelle est fixée par Compose.
