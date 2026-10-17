# ADR 0007 — MapLibre GL JS et fond de carte Protomaps auto-hébergé

- **Statut** : accepté ; remplace l'[ADR 0006](0006-openlayers-carte-chantiers.md)
- **Date** : 2026-10-17
- **Décideur** : propriétaire du projet

## Contexte

La carte des chantiers (lecture seule, direction, Maroc) doit reposer **uniquement sur des solutions gratuites et open
source** : aucun abonnement, aucune clé d'API, aucun contrat. Le moteur importe peu pour le coût : ce qui est payant,
ce sont les serveurs de tuiles (CARTO, Mapbox, Google exigent une clé ou une licence commerciale). Les tuiles
d'OpenStreetMap sont gratuites mais sans garantie de service, réservées à un usage léger, et exigent un en-tête
`Referer` que `frontend/nginx.conf` supprime (`Referrer-Policy: no-referrer`).

Le fond gratuit et professionnel aujourd'hui est **vectoriel** (Protomaps, OpenFreeMap, VersaTiles). OpenLayers
l'afficherait par une couche de traduction des styles (`ol-mapbox-style`), alors que MapLibre le lit nativement.
L'ADR 0006 n'avait introduit que la dépendance `ol`, sans aucun code : la remplacer ne coûtait rien.

## Décision

| Brique | Choix | Licence |
|---|---|---|
| Moteur | `maplibre-gl` 6, utilisé directement dans des composants standalone (pas d'adaptateur Angular tiers) | BSD-3-Clause |
| Lecture de l'archive | `pmtiles` 4 (protocole `pmtiles://`) | BSD-3-Clause |
| Styles | `@protomaps/basemaps` 5, variantes claire et sombre selon `ThemeService`, libellés en français | BSD-3-Clause (styles CC0) |
| Fond | Extrait du Maroc d'un build Protomaps, **servi par notre nginx** | Données OpenStreetMap, ODbL (mention « © OpenStreetMap » obligatoire) |
| Polices et icônes | `protomaps/basemaps-assets`, servies par notre nginx | SIL OFL 1.1 et MIT |

Aucune requête ne part vers un service tiers : le fond fonctionne sur un réseau interne, sans clé et sans limite.
`nginx.conf` garde `Referrer-Policy: no-referrer`.

Écartés : CARTO, Mapbox, Google (clé, licence commerciale) ; OpenStreetMap direct (pas de garantie, en-tête
`Referer`) ; OpenFreeMap public (gratuit, mais dépendance à un service financé par des dons ; reste une option de
secours via `CARTE_CONFIG`) ; les adaptateurs `@maplibre/ngx-maplibre-gl` et `@bluehalo/ngx-leaflet` (inutiles, ils
retardent les montées de version d'Angular).

## Constats de compatibilité (2026-10-17, Angular 22.2.2, TypeScript 6.0.3, Node 24.15.0)

| Vérification | Résultat |
|---|---|
| `peerDependencies` | Aucune pour les trois paquets ; `npm ci` passe sans option |
| Types | Compilation stricte avec `skipLibCheck: false` sans erreur (MapLibre s'appuie sur les types globaux `geojson`, fournis par `@types/geojson`) |
| Build de production | Passe ; bundle initial inchangé (631 kB). Une route de test chargeant MapLibre, PMTiles et les styles produit un chunk à la demande de 1,09 Mo brut / 242 kB compressé, plus le worker (508 kB brut / 144 kB compressé) |
| Zoneless | Une carte créée dans `afterNextRender` dont l'événement `load` met à jour un `signal` rafraîchit le template sans Zone.js ; `map.remove()` dans `DestroyRef.onDestroy` supprime le canvas. Vérifié en WebGL dans Chromium headless (Vitest) |
| Licences | `npm run audit:licences` passe ; seule nouveauté hors liste simple : `@maplibre/mlt` sous « MIT OR Apache-2.0 », deux licences autorisées |
| Vulnérabilités | `npm audit` : 0 |

## Points d'intégration (à connaître)

- **Worker** : MapLibre 6 cherche `maplibre-gl-worker.mjs` à côté de son propre chunk, ce que le build Angular ne
  produit pas. `angular.json` copie donc le fichier sous `carte/`, et `preparerMapLibre()` le déclare avec
  `setWorkerUrl`, avec `?v=<version de MapLibre>` pour qu'un ancien worker ne soit jamais servi depuis le cache.
- **Type MIME** : `mime.types` de nginx (1.31 compris) ne connaît pas `.mjs` ; `nginx.conf` le déclare en
  `application/javascript`, sans quoi le navigateur refuse d'exécuter le worker.
- **Cache** : `/carte/fond/` est exclu du cache immuable des fichiers hashés (`location ^~`, une heure au plus) :
  une mise à jour du fond garde les mêmes noms de fichiers.
- **Tests** : le pré-bundler de Vitest résout `fflate` (dépendance de `pmtiles`) avec la condition `node` ;
  `vitest-base.config.mts` impose la version navigateur. Le build de production n'est pas concerné.
- **Arabe** : les polices couvrent l'alphabet arabe, mais MapLibre a besoin de son module de rendu de droite à gauche
  (`@mapbox/mapbox-gl-rtl-text`, BSD-2-Clause) pour former correctement les noms en arabe. À ajouter avec le
  composant carte.

## Conséquences

- Le fond (plusieurs centaines de Mo) n'est ni dans Git ni dans l'image : `scripts/carte/preparer-fond-maroc.sh` le
  produit, il est monté en lecture seule dans le frontend (`CARTE_FOND_DIR`) et servi sous `carte/fond/`.
- Mettre à jour la carte = relancer le script avec une date de build plus récente ; aucune modification de code.
- Les étapes suivantes (contrat de données, composant carte, page, permissions) s'appuient sur MapLibre.
