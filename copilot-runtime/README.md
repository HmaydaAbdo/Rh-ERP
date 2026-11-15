# Runtime CopilotKit (`staport-intelligence-copilot-runtime`)

Le runtime CopilotKit officiel (`@copilotkit/runtime`), placé entre Angular et le service IA Python (site/docs/ia, T16).
Il ne contient aucune logique métier à nous :

- il relaie l'agent AG-UI du service IA (`IA_AGUI_URL`) avec le jeton de l'utilisateur, recréé à chaque requête par
  la fabrique d'agents officielle ; le service IA fait valider ce jeton par l'API ;
- il applique le middleware A2UI officiel (`a2ui: { injectA2UITool: true }`) : le service IA offre alors l'outil
  `generate_a2ui`, et le flux de cet outil devient une surface affichée par CopilotKit Angular ;
- il authentifie chaque requête (crochet officiel `onRequest`, `/auth/me`) et réserve chaque fil à son propriétaire (crochet `onBeforeHandler` et table `thread_owners`, `src/proprietaires.mjs`) ; le gestionnaire est `createCopilotExpressHandler` (`src/app.mjs`), `src/serveur.mjs` ne fait que l'écoute.

Routes, sous `/copilotkit` (relayées par nginx sous `/ia/copilotkit/`) : `GET /info`, `POST /agent/default/run`,
`POST /agent/default/suggest` (suggestions CopilotKit authentifiées, sans fil persistant), et les routes de connexion et
d'arrêt ; les routes de fils, mémoires, inspecteur et transcription restent fermées. Chaque requête exige le jeton du compte
et la permission `IA_UTILISER` ; un fil n'est lancé, repris ni arrêté que par son propriétaire (un autre utilisateur reçoit 403). Les suggestions portent des identifiants temporaires : l'authentification est obligatoire,
mais le contrôle de propriété des fils persistants ne s'applique pas à cette route sans état.

## Exploitation

- Service Compose `copilot-runtime`, démarré par `docker compose up -d` après le service `ia` ; réseaux
  `assistant-net` (nginx) et `runtime-net` (service IA) ; port `127.0.0.1:${COPILOT_RUNTIME_PORT}` (5004) pour
  `ng serve` en développement.
- Image multi-étapes, base `node:24-alpine` épinglée par digest, dépendances depuis `package-lock.json` sans scripts
  d'installation, utilisateur non privilégié, système de fichiers en lecture seule.
- Télémétrie de CopilotKit et de ses dépendances coupée (`COPILOTKIT_TELEMETRY_DISABLED`, `DO_NOT_TRACK`,
  `SCARF_ANALYTICS`).

## Tests

`npm test` (`node --test`) : authentification, routes fermées et accès croisé aux fils refusé, avec l'API et le service IA simulés (nécessite `npm rebuild better-sqlite3`).

## En local

```bash
npm ci
IA_AGUI_URL=http://127.0.0.1:5003/agui COPILOTKIT_TELEMETRY_DISABLED=true node src/serveur.mjs
```
