# Service IA — image `erp-rh-ia`

Service Python d'ERP-RH, construit uniquement sur les composants officiels (règle « frameworks d'abord ») : agent
`create_agent` de LangChain sur LangGraph (T10), flux AG-UI par CopilotKit et `ag-ui-langgraph` (T11), outils MCP par
le MCP intégré à LangChain, modèles par `ChatLiteLLM` et la passerelle [LiteLLM](../litellm/README.md).
Décisions, plan et état : [site/docs/ia](../site/docs/ia/vue-d-ensemble.md). Règles : [conventions/agents-ia.md](../conventions/agents-ia.md).

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
  Aucun plafond applicatif `max_tokens` : réponse et résumé utilisent les limites natives du modèle.
  Compose et le banc réel activent `LITELLM_LOCAL_MODEL_COST_MAP=True` : catalogue fourni par le SDK,
  sans téléchargement GitHub au démarrage ou pendant une requête ; la passerelle conserve la comptabilité des coûts.
- **Agent (T10, T33)** — `agent.py` : `create_deep_agent` (Deep Agents sur LangGraph, décision du 2026-11-03). Le modèle choisit seul sa forme de
  réponse : directe pour un message simple, avec outils pour une question de données, avec un plan (`write_todos`,
  `TodoListMiddleware`) pour une demande à plusieurs étapes. Middlewares officiels : `CopilotKitMiddleware` (outils du
  navigateur), `TodoListMiddleware`, `ModelCallLimitMiddleware` et `ToolCallLimitMiddleware` (8 par run),
  `SkillsMiddleware` (outils de compétence) et `FilesystemMiddleware` limité à `read_file` (lecture des `SKILL.md`).
- **Outils par compétence (T32)** — `competences/<domaine>/SKILL.md` (7 outils au plus chacune) et `competences.py` : un outil
  métier n'est exposé que par sa compétence ; l'appel d'un outil non épinglé échoue sans s'exécuter. `routage.py` choisit,
  hors modèle (embeddings MiniLM locaux, `evaluation/routage.json`), les compétences à épingler (`pinned_skills`) ; si le
  routage se trompe, le modèle lit lui-même le `SKILL.md` du bon domaine. Aucun appel de modèle de langage pour choisir les outils.
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

Le jeu de référence est conservé, mais son lanceur (`EvaluationAgentIaTest`) appartenait au backend Java retiré en
E2 (KAN-50) : le rejouer exige un lanceur côté API Python (application de test, données synthétiques, passerelle
LiteLLM prête avec `IA_LITELLM_BASE_URL` et `IA_LITELLM_API_KEY`, puis `python -m erp_rh_ia.evaluation`). Ce lanceur
est suivi dans Jira (épopée E5, évaluation de l'agent).

## Développer

Prérequis : `uv` 0.12 ou plus récent (il installe Python 3.14 lui-même).

```bash
cd ia
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run pytest -q
```

`tests/integration/` appelle la **vraie** route `/mcp` de l'application (FastMCP, API Python) avec un jeton agent
RS256 ; il est ignoré sans `MCP_ERP_RH_URL` et lancé, avec le client TypeScript du SDK MCP, par l'API
(application complète et base de test) :

```bash
cd api
uv run pytest tests/test_mcp_clients_externes.py
```

Le flux AG-UI réel avec le client officiel `@ag-ui/client` (`scripts/ia/agui-client`) et le banc de démonstration pour
le navigateur étaient lancés par des tests du backend Java (`FluxAgUiIntegrationTest`, `BancAssistantTest`), retirés en E2
(KAN-50) : leurs lanceurs sont à reconstruire côté API Python (suivi Jira). Le client TypeScript lui-même reste valide et
refuse toute URL autre que `http://127.0.0.1:<port>/agui`.

## Image et exploitation

- Image multi-étapes, bases `python:3.14-slim` et `uv` épinglées par digest ; dépendances installées
  depuis `uv.lock` sans outils de développement ; utilisateur non privilégié `10001`.
- Service Compose `ia` démarré par défaut (sans profil) après la tâche `litellm-cles`, système de fichiers en lecture seule, aucune capacité,
  port `127.0.0.1:${IA_PORT}` (5003 par défaut).
- Variables dans le `.env` racine unique : `IA_ENABLED`, `IA_LITELLM_API_KEY` (clé virtuelle
  ERP-RH, cinq groupes de production uniquement) ; les URL de la passerelle et du backend sont fixées par Compose.
