# Carte des chantiers

> Carte en lecture seule pour la direction : le monde entier, ouverte sur le Maroc, avec ses propres permissions et son
> propre rôle. Uniquement des solutions gratuites : MapLibre GL JS, un plan Protomaps et un relief Mapterhorn
> **auto-hébergés** (voir l'[ADR 0007](../adr/0007-maplibre-protomaps-auto-heberge.md)), et l'imagerie satellite d'Esri,
> seul service tiers, relayée par notre serveur (voir l'[ADR 0009](../adr/0009-carte-satellite-relief-3d.md)). Construite
> par étapes ; ce document décrit ce qui existe aujourd'hui.

| Étape | État |
|---|---|
| 1. Moteur de carte (`maplibre-gl`, `pmtiles`, `@protomaps/basemaps`) | Fait |
| 2. Configuration du fond auto-hébergé, du style sombre et de l'emprise | Fait |
| Permission `CARTE_READ` et rôle `DIRECTION` | Fait — voir [../rbac/carte.md](../rbac/carte.md) |
| Page minimale `/carte` : fond, zoom, état d'erreur, menu « Carte » | Fait |
| Monde entier (globe), zoom rue (19), bâtiments 3D, relief (ombrage et terrain 3D), satellite, vue 3D, boussole, position, plein écran, échelle, fiche d'un lieu | Fait |
| Recherche de lieux | Reportée |
| 3. Contrat `ChantierCarte` et source `GET /chantiers/carte` | Fait |
| 4. Marqueurs MapLibre, fiches et sites partagés | Fait ; panneau « À localiser » reporté |
| 5. Page Chantier immersive : filtre compact par nature et marqueurs sur la carte | Fait localement |

La page `/carte` est une expérience immersive limitée au référentiel Chantier : la carte remplit l’écran. La barre HUD
en haut à gauche reprend **Atlas nocturne Staport** : « Chantiers », un total en pastille et un filtre multi-sélection
compact pour les six natures. Aucune nature sélectionnée signifie « toutes » ; plusieurs natures peuvent être combinées.
Le filtre agit directement sur les marqueurs, sans liste latérale ni recherche séparée. Les sites sont des repères cyan,
sans code imprimé sur la carte ; le nom, le code et la nature apparaissent dans l’infobulle au survol/focus et dans la
fiche au clic. Le Plan vectoriel suit la palette globale bleu nuit avec relief, frontières et routes bleutées. Le filtre
ne réinitialise pas le fond ni les contrôles Plan/Satellite/Relief. Sur petit écran, la barre se replie sur deux lignes.

La source `GET /chantiers/carte` exige `CARTE_READ` et renvoie la projection `ChantierCarteDto`, sans paie ni données
d’un autre domaine. L’affichage signale chargement, erreur et résultat vide avec possibilité de réessayer. Une fiche
regroupe les chantiers partageant exactement une position ; leurs fiches restent dans l’application, sans lien sortant
Google Maps. Les marqueurs restent
présents en changeant de fond. La route est protégée par `CARTE_READ` (migration V28, voir
[../rbac/carte.md](../rbac/carte.md)) et proposée dans le menu sous « Carte ».

## Composants

| Composant | Rôle |
|---|---|
| `ChantierCartePageComponent` (`/carte`) | Carte plein écran, filtre Nature compact, compteur et état d’erreur |
| `ChantierCarteComponent` (`app-chantier-carte`) | Carte « bête » : crée la carte MapLibre et ses contrôles, lit le flavor Plan dans les tokens CSS Atlas nocturne, garde un chrome cartographique nocturne, dessine des repères cyan avec infobulles, redessine au changement de calque, suit la taille de son conteneur et détruit la carte. Région nommée « Carte des chantiers », aide au clavier (flèches, + et −, Maj et flèches pour pivoter et incliner) |

### Ce que la carte propose

| Élément | Comportement |
|---|---|
| Ouverture | Le Maroc entier, provinces du Sud comprises, quelle que soit la taille de l'écran |
| Monde | Toute la Terre : vue de loin, la carte est un **globe** entouré de son atmosphère ; elle repasse à plat en approchant |
| Zoom | Du globe (1) au bâtiment (19). Le Maroc est détaillé jusqu'au bâtiment et au commerce ; le reste du monde jusqu'aux rues (zoom de préparation, 13 par défaut). Au-delà, MapLibre agrandit les tuiles vectorielles sans perte de netteté |
| Boussole | Montre l'orientation et l'inclinaison ; un clic remet la carte au nord |
| **3D / 2D** | Incline la carte à 60° (relief et bâtiments en volume, ciel à l'horizon) ou la remet à plat, au nord. Le clic droit glissé (ou Ctrl + glisser) pivote et incline librement |
| Vue d'ensemble | Revient au Maroc entier, à plat |
| Ma position | Centre la carte sur le poste (demande l'autorisation du navigateur ; HTTPS obligatoire) |
| Plein écran | La carte seule occupe l'écran |
| Échelle | En mètres ou kilomètres, en bas à droite |
| Calques (en bas à gauche) | **Plan** (Protomaps) ou **Satellite** (imagerie Esri, avec frontières, grands axes et libellés blancs du plan par-dessus) ; **Relief** active ou retire l'ombrage et le terrain 3D (actif par défaut) |
| Bâtiments | En volume à leur hauteur OpenStreetMap (6 m à défaut), à partir du zoom 15, en plan seulement (l'imagerie montre déjà les toits) |
| Fiche d'un lieu | Un clic sur un lieu nommé (commerce, quartier, ville, lac…) affiche son nom en français, à défaut son nom local |

Une source introuvable est signalée sans bloquer le reste, de la plus grave à la moins grave : le fond (« Le fond de carte
n'est pas disponible », la carte reste vide), l'imagerie (« Le plan reste utilisable ») puis le relief. Le message
disparaît dès que la source se charge.

La carte, ses contrôles MapLibre, ses calques et ses fiches restent en style sombre quel que soit le thème actif de l'application.
La feuille de MapLibre est insérée en tête du document : sinon sa règle
`.maplibregl-map { position: relative }` écrase le positionnement du conteneur, qui prend une hauteur nulle (carte
blanche).

## Configuration

Tout se règle dans `frontend/src/app/portail/chantier/carte/carte.config.ts`, jeton `CARTE_CONFIG`
(valeur par défaut `CARTE_CONFIG_PAR_DEFAUT`) :

| Champ | Rôle | Défaut |
|---|---|---|
| `fond.archive`, `fond.zoomMaxArchive` | Archive PMTiles du plan (monde, Maroc détaillé) et son zoom maximal | `carte/fond/monde.pmtiles`, 15 |
| `fond.glyphes` | Modèle des polices des libellés | `carte/fond/fonts/{fontstack}/{range}.pbf` |
| `fond.icones` | Dossier des icônes ; la variante `dark` est toujours utilisée | `carte/fond/sprites/v4` |
| `fond.attribution` | Mention légale affichée sur la carte (obligatoire : données OpenStreetMap, ODbL) | Protomaps, © OpenStreetMap |
| `relief.archive`, `relief.zoomMaxArchive` | Archive PMTiles du relief (terrarium, 512 px) et son zoom maximal | `carte/fond/monde-relief.pmtiles`, 11 |
| `relief.exageration` | Exagération verticale du terrain 3D (1 = réel) | 1,4 |
| `relief.attribution` | Mention légale du relief | © Mapterhorn |
| `satellite.tuiles`, `satellite.zoomMaxSource` | Modèle d'URL XYZ de l'imagerie et son zoom maximal (au-delà, agrandie plutôt que d'afficher la tuile « données non disponibles » d'Esri) | `carte/satellite/{z}/{y}/{x}` (relais, voir « Imagerie satellite »), 18 |
| `satellite.tuilesDeSecours` | Relais de secours (tuiles publiques, sans clé), demandé seulement si le principal ne renvoie pas une image | `carte/satellite-secours/{z}/{y}/{x}` |
| `satellite.attribution` | Mention légale de l'imagerie (obligatoire) | Esri, Maxar, Earthstar Geographics |
| `territoire` | `[ouest, sud, est, nord]` en degrés : boîte englobante exacte de la frontière du Maroc ; vue initiale et « Vue d'ensemble » | calculé, voir ci-dessous |
| `margeDeVuePx`, `zoomMin`, `zoomMax` | Espace autour du territoire à l'ouverture (24 px), zooms minimal (1) et maximal (19) | |
| `inclinaison3d` | Inclinaison de la vue 3D, en degrés | 60 |
| `langue` | Langue des libellés (à défaut, nom local) | `fr` |

Les chemins sont relatifs à l'adresse de l'application (`document.baseURI`), ce qui fonctionne aussi derrière le
sous-chemin de nginx outer. `fond-de-carte.ts` transforme la configuration pour MapLibre :

| Fonction | Rôle |
|---|---|
| `preparerMapLibre(base)` | Déclare le worker de MapLibre, le protocole `pmtiles://` et la feuille de style (une seule fois) |
| `creerStyle(config, base, affichage)` | Style sombre complet : plan ou satellite, avec ou sans relief (`Affichage`), globe et atmosphère; indépendant du thème applicatif |
| `optionsDeVue(config)` | Ajustement sur le territoire, zooms et inclinaison maximale (80°) ; la carte n'est pas bornée |
| `territoire(config)` | Boîte englobante du territoire (vue initiale et « Vue d'ensemble ») |

Le composant carte n'utilise que ces fonctions : il ne connaît ni Protomaps, ni Mapterhorn, ni Esri, ni l'emplacement des fichiers.

## Emprise du Maroc

Aucune coordonnée n'est saisie à la main : elles sont **calculées depuis une frontière officielle**. Le **territoire**
sert à la vue initiale ; l'**emprise** (territoire plus une marge) délimite la zone que `preparer-fond-carte.sh`
détaille jusqu'au bâtiment.

| | |
|---|---|
| Source | [Natural Earth](https://github.com/nvkelso/natural-earth-vector), `geojson/ne_10m_admin_0_countries_mar.geojson` (échelle 1:10 000 000, version de juin 2022), domaine public |
| Périmètre | Version **« point de vue du Maroc »** : le territoire tel que le Maroc le définit, provinces du Sud comprises. Six polygones : le territoire principal et cinq petites enclaves ou îlots du littoral nord |
| Territoire | `[-17.104644, 20.766913, -1.031999, 35.926519]` : le minimum et le maximum des 1 075 sommets de la frontière |
| Marge | 0,5° (environ 55 km) sur les quatre côtés, arrondie à 3 décimales **vers l'extérieur** : `[-17.605, 20.266, -0.531, 36.427]` |

La marge a deux raisons : la frontière est généralisée à l'échelle 1:10 000 000 (le littoral et les limites ne sont
précis qu'à quelques kilomètres), et un chantier proche de la frontière doit rester dans la zone détaillée.

**Recalculer** (autre version des données, autre point de vue, autre marge) :

```bash
node scripts/carte/calculer-emprise.mjs chemin/vers/ne_10m_admin_0_countries_mar.geojson
```

Le script réécrit `maroc.frontiere.json` (la frontière) et `emprise-maroc.json` (territoire et emprise), qui alimentent la
carte **et** `scripts/carte/preparer-fond-carte.sh` : il n'existe qu'une seule valeur. `fond-de-carte.spec.ts` la
recalcule indépendamment à chaque exécution des tests : il échoue si le territoire n'est pas exactement la boîte
englobante de la frontière, si l'emprise n'est pas ce territoire plus 0,5° arrondi vers l'extérieur, ou si un seul
sommet de la frontière sort de l'emprise.

## Préparer le fond de carte

Le fond (plan, relief, polices, icônes) n'est **ni dans Git ni dans l'image Docker** et se met à jour indépendamment du
code. `scripts/carte/preparer-fond-carte.sh` le produit ; il a besoin de `git` et de l'outil
[`pmtiles`](https://github.com/protomaps/go-pmtiles/releases) dans le `PATH`, et du dépôt (il lit `emprise-maroc.json`).
Le dossier du fond se place **à côté de `docker-compose.yml`**, en développement comme en production : `docker compose up`
le monte tout seul (`CARTE_FOND_DIR`, défaut `./carte-fond`, n'a pas besoin d'être réglé dans `.env`).

```text
staport-rh/
├── docker-compose.yml
├── .env                     (ARCGIS_API_KEY pour l'imagerie satellite)
└── carte-fond/              (produit par le script, jamais versionné)
    ├── monde.pmtiles        plan : le monde, le Maroc détaillé
    ├── monde-relief.pmtiles relief
    ├── fonts/               polices des libellés
    └── sprites/             icônes
```

Le plan est **une seule archive** : le monde jusqu'au zoom `ZOOM_MONDE`, et le Maroc au-delà jusqu'au zoom 15, deux
extraits disjoints du même build fusionnés par `pmtiles merge`. Le relief suit le même principe (monde jusqu'à
`ZOOM_RELIEF_MONDE`, Maroc jusqu'au zoom 11). Tailles mesurées le 2026-10-18 :

| `ZOOM_MONDE` | Détail hors du Maroc | Plan |
|---|---|---|
| 10 | Villes, grandes routes | 3,8 Go |
| 11 | Quartiers, routes | 8 Go (choisi en développement) |
| 12 | La plupart des rues | 18 Go |
| **13** (défaut) | Toutes les rues | 36 Go |

| `ZOOM_RELIEF_MONDE` | Relief |
|---|---|
| 7 | 0,9 Go |
| **8** (défaut) | 3,2 Go |
| 9 | 10 Go |

Le Maroc détaillé ajoute environ 0,6 Go au plan et 0,5 Go au relief. La préparation demande environ **deux fois** la
taille finale (extraits puis fusion), dans un dossier de travail voisin de la cible (`carte-fond.preparation/`).

**Coupures réseau** : chaque téléchargement est retenté trois fois. Si la préparation échoue malgré tout, relancer **la
même commande** : chaque étape terminée est conservée et sautée (des dizaines de Go ne sont jamais retéléchargés pour
une coupure). Le dossier de travail n'est supprimé qu'en cas de succès. Ne pas modifier le script pendant qu'il tourne :
`sh` le lit au fil de l'exécution.

```bash
# Estimer une taille sans rien télécharger (--dry-run)
pmtiles extract https://build.protomaps.com/20261017.pmtiles essai.pmtiles --maxzoom=13 --dry-run
pmtiles extract https://download.mapterhorn.com/planet.pmtiles essai.pmtiles --maxzoom=8 --dry-run

# Poste de développement (disque plus petit : monde au zoom 11)
ZOOM_MONDE=11 scripts/carte/preparer-fond-carte.sh ./carte-fond

# Production (défauts : monde au zoom 13, relief au zoom 8)
scripts/carte/preparer-fond-carte.sh ./carte-fond 20261017
```

Le second argument est la date d'un build Protomaps (liste sur <https://maps.protomaps.com/builds>, défaut : hier).
Le script récupère d'abord les polices et les icônes de `protomaps/basemaps-assets` (petits, et vérifiés : un
fichier manquant arrête tout avant le gros téléchargement). Il ne remplace le fond existant qu'en fin de traitement : un
échec laisse l'ancien en place. Il supprime alors les archives de l'ancien fond limité au Maroc (`maroc.pmtiles`,
`maroc-relief.pmtiles`). **Mettre à jour la carte** = relancer le script, puis recharger la page ; aucun redémarrage n'est
nécessaire (fichiers statiques).

### Avec `ng serve` (facultatif)

Le serveur de développement d'Angular sert `frontend/carte-fond` sous `carte/fond/` et ne peut pas lire un dossier
situé hors de `frontend/`. Pour ne pas dupliquer plusieurs Go, faire de `frontend/carte-fond` un lien vers le dossier
unique, une fois (aucun droit d'administrateur nécessaire) :

```powershell
New-Item -ItemType Junction -Path frontend\carte-fond -Target carte-fond   # Windows
```

```bash
ln -s ../carte-fond frontend/carte-fond                                      # Linux, macOS
```

`ng s` dresse la liste des fichiers du fond **à son démarrage** : après une préparation du fond, le relancer (sinon il
répond par la page d'accueil et la carte signale un fond indisponible). `docker compose` n'a pas cette contrainte : nginx
lit le dossier à chaque requête.

### Sous Windows (serveur de production)

Le script est un script `sh` : le lancer avec **Git Bash** (inclus dans Git for Windows), après avoir placé
`pmtiles.exe` dans un dossier, par exemple `C:\outils\pmtiles` :

```powershell
& "C:\Program Files\Git\bin\bash.exe" -lc 'export PATH="$PATH:/c/outils/pmtiles"; cd /c/outils/Rh-ERP && scripts/carte/preparer-fond-carte.sh /c/outils/carte-fond 20261017'
```

Git Bash réécrit tout argument commençant par `/` en chemin Windows avant de le passer à un programme Windows (`git`,
`pmtiles`). C'est ce qui avait fait échouer la première version du script (motifs `/fonts/...` de `git sparse-checkout`,
qui ne trouvaient plus rien) : les motifs du script sont donc écrits sans `/` initial. Les chemins temporaires, eux, sont
bien convertis, et c'est voulu.

### Brancher le fond sur un `docker-compose.yml` déjà déployé

Une installation dont le `docker-compose.yml` est antérieur à la carte doit ajouter, dans le service `frontend`, le
montage du dossier du fond (sans lui, les fichiers copiés restent invisibles pour l'application) :

```yaml
    volumes:
      - ${CARTE_FOND_DIR:-./carte-fond}:/usr/share/nginx/html/carte/fond:ro
```

Puis `docker compose up -d frontend`. En production, nginx sert ces fichiers sous `/carte/fond/` avec les requêtes
partielles (`Range`) qu'exige PMTiles, gérées nativement pour un fichier statique : le navigateur ne lit que les
morceaux de l'archive dont il a besoin, quelle que soit sa taille. Ces fichiers sont mis en cache une heure au plus, et
seulement les réponses réussies (un `404` n'est jamais gardé). Si le dossier est vide, la carte s'affichera sans fond,
avec le message d'erreur ci-dessus.

## Imagerie satellite

Le navigateur demande les tuiles à l'application (`carte/satellite/{z}/{y}/{x}`) ; le nginx du frontend les relaie vers
Esri en ajoutant la clé ArcGIS (modèle `frontend/nginx-templates/carte-satellite.conf.template`, rempli au démarrage
du conteneur avec `ARCGIS_API_KEY`). La clé n'arrive jamais au navigateur. En développement, `proxy.conf.js` fait le
même relais, avec la clé de l'environnement de `ng serve` ou, à défaut, celle du `.env` racine : une seule clé pour
`docker compose` et `ng s`. La clé est **obligatoire** : sans elle, `docker compose` et `ng s` refusent de démarrer
(seule la CI, variable `CI`, en est dispensée : ses tests n'affichent pas l'imagerie).

**Secours automatique** : Esri répond à un refus (quota dépassé, clé expirée ou révoquée) par un petit JSON en `200`,
jamais par un code d'erreur. La carte vérifie donc que chaque réponse est une image (`tuileSatellite`, protocole
`satellite://`) ; sinon, ou si le relais est en panne, elle bascule sur `carte/satellite-secours/{z}/{y}/{x}` (mêmes
images, tuiles publiques d'Esri, sans clé) et y reste jusqu'au rechargement de la page. Sans moyen de paiement enregistré
chez Esri, rien n'est jamais facturé ; le secours évite en plus toute coupure de l'imagerie.

Les relais n'acceptent que des coordonnées de tuile en `GET`, n'envoie à Esri ni cookie, ni en-tête `Authorization`, ni
`Referer`, et résout Esri à la demande : nginx démarre même si Esri est injoignable.

### Clé ArcGIS

Gratuite : le niveau gratuit d'ArcGIS Location Platform compte 2 000 000 tuiles de fond de carte par mois. Les libellés
de l'interface d'Esri peuvent varier légèrement.

1. Créer un compte **ArcGIS Location Platform** sur <https://location.arcgis.com/sign-up/> (pas un compte ArcGIS Online)
   et confirmer l'adresse électronique.
2. Se connecter, puis ouvrir **Developer credentials** et choisir **New developer credential**, type **API key
   credentials**.
3. **Referrers** : laisser vide. La clé est utilisée par le serveur, qui n'envoie pas d'en-tête `Referer`.
4. **Privileges** : cocher **Location services → Basemaps** (et rien d'autre).
5. **Item access** : aucun élément.
6. Nommer la clé (par exemple « Carte RH-ERP »), choisir une **date d'expiration** (un an au plus) et la noter dans
   l'agenda, puis créer la clé et **copier sa valeur** (elle n'est affichée qu'une fois).
7. Sur le serveur, dans `.env` : `ARCGIS_API_KEY=la-valeur-copiée`, puis `docker compose up -d frontend`.
8. Vérifier, sur le serveur : `curl -sI http://127.0.0.1:${FRONTEND_PORT}/carte/satellite/12/1665/1960` doit répondre
   `200` et `Content-Type: image/jpeg`.

`ng s` lit la même ligne du `.env` racine : rien d'autre à faire. Ne jamais écrire la clé dans un fichier versionné
(`.env` ne l'est pas).

**Renouveler** avant l'échéance : créer une nouvelle clé (étapes 2 à 6), la mettre dans `.env`, relancer le frontend,
puis supprimer l'ancienne clé. Sans moyen de paiement enregistré, Esri ne facture jamais : au-delà du niveau gratuit, il
refuse les tuiles jusqu'au mois suivant, et la carte affiche « L'imagerie satellite n'est pas disponible ».

## Changer de fond

Fournir un autre `CARTE_CONFIG`, par exemple dans `app.config.ts` :

```ts
{ provide: CARTE_CONFIG, useValue: { ...CARTE_CONFIG_PAR_DEFAUT, fond: { ...FOND_DE_CARTE_PAR_DEFAUT, archive: 'https://tuiles.staport.ma/monde.pmtiles' } } }
```

Tout fournisseur doit rester **gratuit** (règle du projet). Avant d'utiliser un fond hébergé ailleurs que par
l'application, vérifier ses conditions d'usage et sa mention légale.

## Conditions d'usage

- Frontière du Maroc : Natural Earth, domaine public (aucune mention obligatoire).
- Données du plan : OpenStreetMap, licence ODbL. La mention « © OpenStreetMap » doit rester visible sur la carte.
- Styles Protomaps : CC0 ; code BSD-3-Clause. Polices : SIL OFL 1.1 ; icônes : MIT.
- Relief : Mapterhorn, données ouvertes (Copernicus DEM et autres sources, détail sur
  <https://mapterhorn.com/attribution>). La mention « © Mapterhorn » doit rester visible.
- Imagerie satellite : Esri World Imagery ; la mention « Esri, Maxar, Earthstar Geographics » doit rester visible. C'est
  le seul service tiers, appelé par le serveur et seulement en mode Satellite ; voir l'[ADR 0009](../adr/0009-carte-satellite-relief-3d.md).
- Le plan et le relief n'appellent aucun service tiers : aucune clé, aucune limite, aucun coût.

## Limites connues

- **Périmètre à confirmer par la direction** : l'emprise suit le point de vue du Maroc de Natural Earth (provinces du Sud
  comprises). Un autre périmètre = une autre version du fichier source et le même script.
- La frontière est à l'échelle 1:10 000 000 : elle sert à calculer l'emprise, pas à localiser un chantier à quelques mètres.
- Les noms s'affichent en français, en tifinagh et en arabe (vu à l'écran le 2026-10-18, rendu de droite à gauche correct).
- Hors du Maroc, le plan s'arrête aux rues (pas de bâtiments ni de commerces) avec le zoom 13 par défaut.
- Pas de recherche de lieux (reportée).
- Les hauteurs de bâtiments manquent souvent dans OpenStreetMap au Maroc : ces bâtiments prennent 6 m.
