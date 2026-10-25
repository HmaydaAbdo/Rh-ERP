# Frontend — rh-erp

Application Angular 22 (composants standalone `OnPush`, signaux, zoneless) avec le kit Staport (Angular Aria/CDK, Lucide, Tailwind 4). La documentation complète
(structure, routes et permissions, session, composants partagés, tableaux) est dans
[`docs/frontend/README.md`](../docs/frontend/README.md) ; les règles d'écriture sont dans
[`conventions/frontend.md`](../conventions/frontend.md).

## Commandes

```bash
npm install
npm start                                                  # http://localhost:4200 — proxy API vers http://localhost:8080
npm run build                                              # build dans dist/
npx ng build --configuration production                    # build de production (utilisé par la CI)
npm test                                                   # tests unitaires et composants (Vitest, Chromium)
npm run e2e                                                # parcours E2E Playwright (API simulée)
```

Le backend doit tourner pour que l'application fonctionne (voir le [README racine](../README.md)). Le proxy de
développement `proxy.conf.js` relaie les chemins d'API vers `BACKEND_URL` (défaut `http://localhost:8080`) ; tout
nouveau préfixe d'API s'ajoute aussi à `nginx.conf` (production).

## Fichiers à la racine

| Fichier | Rôle |
|---|---|
| `proxy.conf.js` | Proxy de développement (distingue navigation de page et appel API par l'en-tête `Accept`) ; `/ia/*` vers le service IA (`IA_URL`, sinon `http://localhost:${IA_PORT}`, 5003 par défaut) |
| `nginx.conf` | nginx « inner » de production : sert l'application, relaie l'API, fournit `/health` |
| `Dockerfile` | Build de l'application puis image nginx |
| `angular.json` | Configuration Angular CLI |
| `src/styles/_tokens.scss` | Tokens de design (couleurs, espacements, rayons, ombres) |
