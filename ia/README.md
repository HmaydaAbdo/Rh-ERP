# Service IA — image `erp-rh-ia`

Service Python d'ERP-RH : graphe LangGraph (T6), client MCP vers Spring (T3–T5), point d'entrée
AG-UI vers Angular (T7), modèles uniquement par la passerelle [LiteLLM](../litellm/README.md).
Décisions, plan et état : [docs/ia.md](../docs/ia.md). Règles : [conventions/agents-ia.md](../conventions/agents-ia.md).

## État actuel

- Santé : `GET /health` (processus vivant) et `GET /health/ready` (IA désactivée, ou passerelle
  LiteLLM joignable ; sinon `503`).
- Configuration typée (`src/erp_rh_ia/config.py`) ; le service refuse de démarrer sans
  `IA_ENABLED`, `IA_LITELLM_BASE_URL`, `IA_LITELLM_API_KEY` (8 caractères au moins) ou `IA_ERP_API_URL`.
- **AG-UI** — `agui.py`, `POST /agui` (SSE), produit par l'intégration officielle `ag-ui-langgraph`
  (`LangGraphAgent`, [ADR 0015](../docs/adr/0015-ag-ui-integration-langgraph-officielle.md)). Entrée :
  `RunAgentInput` et `Authorization: Bearer <jeton de connexion>`, échangé auprès de Spring contre le jeton agent ;
  refus HTTP avant tout flux (`401`, `403`, `422`, `503`). Sortie : `RUN_STARTED`, `STEP_*` par nœud du graphe,
  `TOOL_CALL_START/ARGS/END`, la réponse **vérifiée** (`TEXT_MESSAGE_*`, émise par `conclure` ; aucun brouillon),
  `CUSTOM com.staport.answer.v1` (abstention, motif, vue), `CUSTOM com.staport.mascot.state.v1` (humeur logique,
  séquence croissante), `STATE_SNAPSHOT`/`MESSAGES_SNAPSHOT` (conversation visible seulement : question, appels,
  synthèse des résultats, réponse) et `RUN_FINISHED`. Frontière de sécurité : ni `RAW` ni `rawEvent`, `RUN_ERROR`
  générique, journal sans trace d'exception. Un checkpointer en mémoire neuf par run ; une déconnexion du client
  annule le run et ferme la session MCP. Seule la dernière question est lue (pas d'historique en J1).
- Client LiteLLM : alias `ai-gateway`, tag de tâche obligatoire (`Tache`), aucune nouvelle tentative
  côté service (la passerelle bascule déjà).
- Preuve MCP : `tests/compatibilite/` rejoue contre le serveur Java les scénarios du client
  TypeScript ; lancée par `McpCompatibilityTest` (profil Maven `mcp-compatibility`).
- **Agent (T6)** — `agent.py` : graphe LangGraph explicite
  `preparer → cibler → choisir ⇄ executer → rediger → verifier`. Bornes : 3 tours d'outils, 6 appels, 2 rédactions,
  résultat d'outil tronqué à 12 000 caractères. Un refus « Accès refusé » n'est jamais retenté ; un outil
  hors catalogue n'est pas appelé ; une sortie JSON invalide est rédigée une seconde fois. Aucune mémoire
  durable : chaque question est un run indépendant.
- **Ciblage par domaine** — `domaines.py` : un petit modèle (tag `simple`) choisit les domaines utiles
  (paie, employés, référentiels, administration, système) ; seuls leurs outils partent vers le modèle
  `complex`, aucun d'office. Un préfixe d'outil non déclaré forme son propre domaine et suit le même
  ciblage. Un ciblage invalide ou indisponible garde tout le catalogue. Ce n'est pas un contrôle d'accès :
  Spring revérifie chaque appel.
- **Vérificateur de chiffres** — `verification.py` : chaque nombre de la réponse (formats `3 000,50`,
  `3000.50`, espaces insécables) doit figurer dans les résultats d'outils ou la question. Sinon une
  réécriture, puis abstention `CHIFFRES_NON_VERIFIES`. Un pourcentage ou un total recalculé par le modèle
  est donc refusé.
- **Modèle** — `modele.py` : appels d'outils puis réponse JSON validée (`reponse`, `vue`, `abstention`),
  tag `complex`, température 0. La vue proposée est choisie parmi celles rendues par les outils, jamais
  inventée.
- **Outils** — `outils.py` : une session MCP par question, avec le jeton agent de l'utilisateur.

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
- Service Compose `ia` sous le profil `ia`, système de fichiers en lecture seule, aucune capacité,
  port `127.0.0.1:${IA_PORT}` (5003 par défaut).
- Variables dans le `.env` racine unique : `IA_ENABLED`, `IA_LITELLM_API_KEY` (clé virtuelle
  ERP-RH, `metadata.tags: ["!eval"]`) ; les URL de la passerelle et du backend sont fixées par Compose.
