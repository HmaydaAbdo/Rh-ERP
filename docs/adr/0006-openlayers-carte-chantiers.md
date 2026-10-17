# ADR 0006 — OpenLayers pour la carte des chantiers

- **Statut** : accepté
- **Date** : 2026-10-17
- **Décideur** : propriétaire du projet

## Contexte

La direction veut une « Carte des chantiers » centrée sur le Maroc, en lecture seule et servant de point
d'entrée vers la fiche d'un chantier. Le frontend n'a aucune brique cartographique. `conventions/frontend.md`
exige de vérifier peer dependencies, licences, compatibilité zoneless et bundle avant d'ajouter une dépendance.

La carte est livrée par étapes, chacune dans sa propre PR. Cette ADR couvre l'étape 1 : l'ajout de la
dépendance et les vérifications de compatibilité. Aucun écran, aucune route ni aucune permission n'est encore
ajouté.

## Décision

Utiliser **OpenLayers** (`ol`, `^10.11.0`, BSD-2-Clause) **directement** dans des composants standalone Angular,
sans wrapper tiers. On n'importe que les modules nécessaires (`ol/Map`, `ol/View`, `ol/layer/Tile`, …) depuis une
route chargée à la demande, de sorte qu'OpenLayers n'entre jamais dans le bundle initial.

## Constats de compatibilité (2026-10-17, Angular 22.2.2, TypeScript 6.0.3, Node 24.15.0)

| Vérification | Résultat |
|---|---|
| `peerDependencies` | Aucune : `ol` ne dépend pas d'Angular ; `npm ci` passe sans `--force` ni `legacy-peer-deps` |
| Types | Fournis par `ol`. Une compilation avec `skipLibCheck: false` et le `tsconfig` strict du projet passe sans erreur sur ses 156 fichiers `.d.ts` utilisés |
| Build de production | Passe. Une route de test important `Map`, `View`, `TileLayer`, `XYZ` et `proj` produit un chunk à la demande de 233 kB brut / 60 kB compressé ; le bundle initial est inchangé (631 kB) |
| Zoneless | Une carte créée dans `afterNextRender`, dont les événements `tileloaderror` mettent à jour un `signal`, rafraîchit le template sans Zone.js. `setTarget(undefined)` puis `dispose()` dans `DestroyRef.onDestroy` détachent la carte. Vérifié par un test Vitest/Chromium avec tuiles simulées (sans réseau) |
| Vulnérabilités | `npm audit` : 0 |
| Licences | `npm run audit:licences` passe. Dépendances ajoutées : MIT, ISC, Apache-2.0, BSD-3-Clause, CC0-1.0, `MIT AND BSD-3-Clause` (`zstddec`) et `(MIT AND Zlib)` (`pako`) |

Les fichiers de vérification (composant et test de sonde) ont été retirés après usage : seule la dépendance est
livrée à cette étape.

## Points de vigilance

- **Dépendance transitive en bêta** : `ol@10.11.0` dépend de `geotiff@^3.1.0-beta.0`. Ce module n'est utilisé que
  par les sources GeoTIFF, que la carte n'importe pas : il n'est pas présent dans le build. Réexaminer à chaque
  mise à jour d'`ol`.
- **Licence Zlib** (`pako`) : permissive mais absente de la liste `--onlyAllow` ; l'outil accepte l'expression
  composée. À confirmer explicitement par le propriétaire du projet.
- **Tuiles OpenStreetMap** : les conditions d'usage de `tile.openstreetmap.org` exigent un en-tête `Referer`
  valide, alors que `frontend/nginx.conf` envoie `Referrer-Policy: no-referrer`. Avant la mise en production,
  choisir entre assouplir cet en-tête et un autre fournisseur de tuiles (CARTO, tuiles auto-hébergées), et vérifier
  ses conditions d'usage.

## Conséquences

- Les étapes suivantes (configuration du fond, contrat de données, composant carte, page, permissions et rôle
  dédiés) s'appuient sur `ol` sans autre dépendance cartographique.
- La mise à jour d'`ol` suit le workflow de `conventions/frontend.md` : build, tests, audit, licences, bundle.
