# Client AG-UI de test (T7)

Client TypeScript de test uniquement : le client officiel `@ag-ui/client` (`HttpAgent`) contre le point
d'entrée `POST /agui` du service IA. Il vérifie le cycle complet (outil Spring, réponse vérifiée,
mascotte), l'arrêt par le client et le refus d'un jeton invalide. Le client Angular du panneau (T8) est
un autre sujet ; ce dossier ne fait pas partie du runtime.

Lancé par `FluxAgUiIntegrationTest` (backend), qui démarre l'application de test et le service IA, puis
fournit `AGUI_URL`, `AGUI_JETON`, `AGUI_QUESTION` et `AGUI_ATTENDU`. Le client refuse toute URL autre que
`http://127.0.0.1:<port>/agui`. Mode d'emploi : [`ia/README.md`](../../../ia/README.md).

```powershell
npm ci --ignore-scripts --prefix scripts/ia/agui-client
npm run typecheck --prefix scripts/ia/agui-client
```

Versions figées par `package-lock.json` ; `@ag-ui/client` 1.0.2, la plus récente publiée depuis plus de
deux semaines à l'adoption (2026-10-25).
