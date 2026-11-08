# Compatibilité MCP — client TypeScript contre le serveur Python

Client de test du SDK MCP TypeScript (le même SDK que celui du runtime Node CopilotKit) qui appelle le
**serveur MCP de l'API Python** (FastMCP, route `/mcp`) avec un **jeton agent RS256** émis par
`POST /auth/jetons/agent`. Il ne fait pas partie du runtime : il prouve l'interopérabilité (KAN-50).

Le test est lancé par `api/tests/test_mcp_clients_externes.py`, qui démarre l'application complète sur un
port loopback éphémère (uvicorn, PostgreSQL réel par testcontainers), crée un administrateur, émet son jeton
agent puis exécute, avec `MCP_ERP_RH_URL`, `MCP_ERP_RH_JETON` et `MCP_ERP_RH_UTILISATEUR` :

- ce client TypeScript (`node --test src/interop.test.ts`) ;
- le client Python officiel du service IA (`ia/tests/integration/test_mcp_erp_rh.py`, lancé par `uv run --locked`).

Depuis la racine, avec Node 24.15+ (< 25), `uv` et Docker :

```powershell
npm ci --ignore-scripts --prefix scripts/ia/mcp-compatibility
npm run typecheck --prefix scripts/ia/mcp-compatibility
npm audit --audit-level=moderate --prefix scripts/ia/mcp-compatibility
Set-Location api
uv run pytest tests/test_mcp_clients_externes.py
```

Le client refuse toute URL autre que `http://127.0.0.1:<port>/mcp` : ne pas le lancer contre un autre serveur.
Les scénarios couvrent la négociation (révision `2025-11-25`), le catalogue de 31 outils, l'identité lue
dans le jeton et jamais dans les arguments, le refus d'un argument inconnu par le schéma, le `401` sans jeton ou
avec un jeton falsifié, et l'absence de session (le serveur est sans état). Le lockfile npm est versionné.
