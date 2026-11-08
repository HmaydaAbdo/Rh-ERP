# Client AG-UI de test (T7)

Client TypeScript de test uniquement : le client officiel `@ag-ui/client` (`HttpAgent`) contre le point
d'entrée `POST /agui` du service IA. Il vérifie le cycle complet (outil MCP, réponse vérifiée,
mascotte), l'arrêt par le client et le refus d'un jeton invalide. Le client Angular du panneau (T8) est
un autre sujet ; ce dossier ne fait pas partie du runtime.

Son lanceur Java (`FluxAgUiIntegrationTest`) a été retiré avec le backend Spring (E2, KAN-50) ; un lanceur côté API Python
(application de test, service IA et passerelle LiteLLM) reste à écrire et doit fournir `AGUI_URL`, `AGUI_JETON`,
`AGUI_QUESTION` et `AGUI_ATTENDU`. Le client refuse toute URL autre que
`http://127.0.0.1:<port>/agui`. Mode d'emploi : [`ia/README.md`](../../../ia/README.md).

```powershell
npm ci --ignore-scripts --prefix scripts/ia/agui-client
npm run typecheck --prefix scripts/ia/agui-client
```

Versions figées par `package-lock.json` ; `@ag-ui/client` 1.0.3, dernière version stable au 2026-10-25.
`zod` est forcé en 4.6.7 (`overrides`) : le client déclare `zod` 3, touché par GHSA-mrhx-c7xc-m3w5 sans correctif
en 3.x. Le flux réel passe avec `zod` 4 ; le frontend applique le même forçage. À retirer quand le client
déclarera `zod` 4.
