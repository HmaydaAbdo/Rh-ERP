# Service IA — image `erp-rh-ia`

Service Python d'ERP-RH, construit uniquement sur les composants officiels (règle « frameworks d'abord ») : agent
`create_agent` de LangChain sur LangGraph (T10), flux AG-UI par CopilotKit et `ag-ui-langgraph` (T11), outils MCP par
le MCP intégré à LangChain, modèles par `ChatLiteLLM` et la passerelle [LiteLLM](../litellm/README.md).
Décisions, plan et état : [docs/ia.md](../docs/ia.md). Règles : [conventions/agents-ia.md](../conventions/agents-ia.md).

## État actuel

- Santé : `GET /health` (processus vivant) et `GET /health/ready` (IA désactivée, ou passerelle
  LiteLLM joignable ; sinon `503`).
- Configuration typée (`src/erp_rh_ia/config.py`) ; le service refuse de démarrer sans
  `IA_ENABLED`, `IA_LITELLM_BASE_URL`, `IA_LITELLM_API_KEY` (8 caractères au moins) ou `IA_ERP_API_URL`.
- **AG-UI** — `agui.py`, `POST /agui` (SSE) : `LangGraphAGUIAgent` (CopilotKit, sur `ag-ui-langgraph`).
  Entrée : `RunAgentInput` et `Authorization: Bearer <jeton de connexion>`, échangé auprès de Spring contre le jeton
  agent ; refus HTTP avant tout flux (`401`, `403`, `422`, `503`). Sortie : `RUN_STARTED`, `REASONING_*` (raisonnement
  du modèle), `TEXT_MESSAGE_*` (texte en flux), `TOOL_CALL_*`, `STATE_SNAPSHOT` (état partagé du run),
  `MESSAGES_SNAPSHOT`, `RUN_FINISHED`. Ne reste à nous que : l'identité (jeton) et une frontière de sécurité (ni
  `RAW` ni `rawEvent`, `RUN_ERROR` générique, journal sans trace d'exception). Une déconnexion du client annule le run.
  Seule la conversation du run existe (mémoire durable : T19).
- **Modèles** — `modeles.py` : `ChatLiteLLM` (le seul connecteur qui transmet le raisonnement) sur les groupes
  `ai-gateway-{simple,medium,complex,code,ocr}`, choisis par capacité, aucune nouvelle tentative côté service (la passerelle bascule).
  Aucun plafond applicatif `max_tokens` : réponse, sélection d'outils et résumé utilisent les limites natives du modèle.
  Compose et le banc réel activent `LITELLM_LOCAL_MODEL_COST_MAP=True` : catalogue fourni par le SDK,
  sans téléchargement GitHub au démarrage ou pendant une requête ; la passerelle conserve la comptabilité des coûts.
- **Agent (T10)** — `agent.py` : `create_agent` (LangChain sur LangGraph). Le modèle choisit seul sa forme de
  réponse : directe pour un message simple, avec outils pour une question de données, avec un plan (`write_todos`,
  `TodoListMiddleware`) pour une demande à plusieurs étapes. Middlewares officiels : `CopilotKitMiddleware` (outils du
  navigateur), `TodoListMiddleware`, `ModelCallLimitMiddleware` et `ToolCallLimitMiddleware` (8 par run),
  `LLMToolSelectorMiddleware` (modèle interne de tâche `simple`, toujours actif).
- **Exactitude** — aucun vérificateur de réponse maison : les outils métier renvoient leurs calculs et l'agent reprend
  leurs valeurs, s'appuie sur les faits déjà établis dans la conversation, relit l'ERP si une valeur a pu changer et
  pose une question si l'ambiguïté peut changer le résultat. Le jeu de référence mesure l'exactitude.
- **Outils** — `outils.py` : le MCP intégré à LangChain (`langchain.mcp`, FastMCP) charge les outils de Spring avec le
  jeton agent de l'utilisateur ; l'échange de jeton est le seul code à nous.
- **Évaluation** — `evaluation.py` (`openevals`, `agentevals`) sur le vrai agent ; `tests/test_passerelle_simulee.py`
  rejoue l'agent sur une passerelle simulée par CopilotKit `aimock`, sans réseau ni quota.

## Évaluation (jeu de référence)

`evaluation/jeu_reference.json` contient les cas (réponses chiffrées, textes, dates, statuts,
abstentions, refus). La vérité n'est jamais écrite à la main : l'évaluateur appelle l'outil attendu
avec l'identité de l'utilisateur, puis compare la réponse de l'agent.

```bash
cd backend
./mvnw -B -Dia.evaluation=true -Dtest=EvaluationAgentIaTest test
```

Prérequis : passerelle LiteLLM prête et `IA_LITELLM_BASE_URL`, `IA_LITELLM_API_KEY` dans
l'environnement. Le test crée des données synthétiques, démarre l'application, puis lance
`python -m erp_rh_ia.evaluation`. Rapport : `backend/target/evaluation-ia.json` (exactitude,
latences p50/p95, détail par cas) ; journal : `backend/target/evaluation-ia.txt`.

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

Flux AG-UI réel avec le client officiel `@ag-ui/client` (`scripts/ia/agui-client`) : l'application de test,
ce service lancé par `uvicorn` et une passerelle LiteLLM prête (`IA_LITELLM_BASE_URL`, `IA_LITELLM_API_KEY`) :

```bash
npm ci --ignore-scripts --prefix scripts/ia/agui-client
cd backend
./mvnw -B -Dia.agui=true -Dtest=FluxAgUiIntegrationTest test
```

Journaux : `backend/target/agui-client.txt` et `backend/target/agui-service.txt`.

Banc de démonstration pour le navigateur (`BancAssistantTest`, `-Dia.banc=true`) : l'application de test avec des données
fictives, un compte de test et ce service (port 5103), laissés en marche jusqu'à `backend/target/banc-assistant.stop`
(45 minutes au plus). Ports, compte et codes chantier dans `backend/target/banc-assistant.json` ; pointer `ng serve` dessus
avec `BACKEND_URL` et `IA_URL`, et lancer le backend avec `CORS_ALLOWED_ORIGINS` incluant l'origine de `ng serve`.

## Image et exploitation

- Image multi-étapes, bases `python:3.13-slim` et `uv` épinglées par digest ; dépendances installées
  depuis `uv.lock` sans outils de développement ; utilisateur non privilégié `10001`.
- Service Compose `ia` démarré par défaut (sans profil) après la tâche `litellm-cles`, système de fichiers en lecture seule, aucune capacité,
  port `127.0.0.1:${IA_PORT}` (5003 par défaut).
- Variables dans le `.env` racine unique : `IA_ENABLED`, `IA_LITELLM_API_KEY` (clé virtuelle
  ERP-RH, cinq groupes de production uniquement) ; les URL de la passerelle et du backend sont fixées par Compose.
