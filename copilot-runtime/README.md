# Runtime CopilotKit (`erp-rh-copilot-runtime`)

Le runtime CopilotKit officiel (`@copilotkit/runtime`), placé entre Angular et le service IA Python (docs/ia.md, T16).
Il ne contient aucune logique à nous :

- il relaie l'agent AG-UI du service IA (`IA_AGUI_URL`) avec le jeton de l'utilisateur, recréé à chaque requête par
  la fabrique d'agents officielle ; le service IA fait valider ce jeton par Spring ;
- il applique le middleware A2UI officiel (`a2ui: { injectA2UITool: true }`) : le service IA offre alors l'outil
  `generate_a2ui`, et le flux de cet outil devient une surface affichée par CopilotKit Angular ;
- il refuse d'emblée une requête sans jeton `Bearer`.

Routes, sous `/copilotkit` (relayées par nginx sous `/ia/copilotkit/`) : `GET /info`, `POST /agent/default/run`
et les autres routes du runtime ; `GET /health` pour le contrôle de santé.

## Exploitation

- Service Compose `copilot-runtime`, démarré par `docker compose up -d` après le service `ia` ; réseaux
  `assistant-net` (nginx) et `runtime-net` (service IA) ; port `127.0.0.1:${COPILOT_RUNTIME_PORT}` (5004) pour
  `ng serve` en développement.
- Image multi-étapes, base `node:24-alpine` épinglée par digest, dépendances depuis `package-lock.json` sans scripts
  d'installation, utilisateur non privilégié, système de fichiers en lecture seule.
- Télémétrie de CopilotKit et de ses dépendances coupée (`COPILOTKIT_TELEMETRY_DISABLED`, `DO_NOT_TRACK`,
  `SCARF_ANALYTICS`).

## En local

```bash
npm ci
IA_AGUI_URL=http://127.0.0.1:5003/agui COPILOTKIT_TELEMETRY_DISABLED=true node src/serveur.mjs
```
