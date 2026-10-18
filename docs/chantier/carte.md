# Carte des chantiers

> Carte en lecture seule pour la direction, centrée et bornée sur le Maroc, avec ses propres permissions et son propre
> rôle (étape ultérieure). Uniquement des solutions gratuites et open source : MapLibre GL JS et un fond Protomaps
> **auto-hébergé** — voir l'[ADR 0007](../adr/0007-maplibre-protomaps-auto-heberge.md). Construite par étapes, une PR
> par étape ; ce document décrit ce qui existe aujourd'hui.

| Étape | État |
|---|---|
| 1. Moteur de carte (`maplibre-gl`, `pmtiles`, `@protomaps/basemaps`) | Fait |
| 2. Configuration du fond auto-hébergé, du thème et de l'emprise | Fait |
| Permission `CARTE_READ` et rôle `DIRECTION` | Fait — voir [../rbac/carte.md](../rbac/carte.md) |
| Page minimale `/carte` : fond du Maroc, thème, zoom, état d'erreur, menu « Carte » | Fait |
| 3. Contrat de données `ChantierCarte` et source | À faire |
| 4. Composant carte, marqueurs, panneau « À localiser » | À faire |
| 5. Page complète (indicateurs, légende, filtres) | À faire |

La page `/carte` existe : elle affiche le fond du Maroc et rien d'autre (aucune donnée de chantier). Elle est protégée par `CARTE_READ` (migration V28, voir [../rbac/carte.md](../rbac/carte.md)) et proposée dans le menu sous « Carte ».

## Composants

| Composant | Rôle |
|---|---|
| `ChantierCartePageComponent` (`/carte`) | Page : carte plein écran dans la zone de contenu, sans titre |
| `ChantierCarteComponent` (`app-chantier-carte`) | Carte « bête » : crée la carte MapLibre, boutons de zoom, mention légale, redessine au changement de thème, suit la taille de son conteneur, détruit la carte. Si le fond est introuvable, elle affiche le message « Le fond de carte n'est pas disponible » (la carte reste vide). Région nommée, aide au clavier (flèches, + et −) |

Les couleurs des contrôles MapLibre viennent des jetons du design system (`--map-icon-filter` pour les icônes en thème sombre). Les zones situées hors de l'emprise PMTiles reprennent la couleur de l'eau afin d'éviter un fond gris lorsque l'archive locale ne contient pas les tuiles voisines.

## Configuration

Tout se règle dans `frontend/src/app/portail/chantier/carte/carte.config.ts`, jeton `CARTE_CONFIG`
(valeur par défaut `CARTE_CONFIG_PAR_DEFAUT`) :

| Champ | Rôle | Défaut |
|---|---|---|
| `fond.archive` | Archive PMTiles du fond (tuiles vectorielles) | `carte/fond/maroc.pmtiles` |
| `fond.glyphes` | Modèle des polices des libellés | `carte/fond/fonts/{fontstack}/{range}.pbf` |
| `fond.icones` | Dossier des icônes ; `light` ou `dark` y est ajouté selon le thème | `carte/fond/sprites/v4` |
| `fond.attribution` | Mention légale affichée sur la carte (obligatoire : données OpenStreetMap, ODbL) | Protomaps, © OpenStreetMap |
| `territoire` | `[ouest, sud, est, nord]` en degrés : boîte englobante exacte de la frontière ; la carte s'y ajuste à l'ouverture, quelle que soit la taille de l'écran | calculé, voir ci-dessous |
| `emprise` | Territoire plus 0,5° de marge ; le **centre** de la carte ne peut pas en sortir | calculé, voir ci-dessous |
| `margeDeVuePx`, `zoomMin`, `zoomMax` | Espace autour du territoire à l'ouverture (24 px), zooms minimal (3) et maximal (15) | |
| `langue` | Langue des libellés (à défaut, nom local) | `fr` |

Les valeurs de `territoire` et `emprise` sont dans `emprise-maroc.json`, produit par un script (jamais saisies à la main). Les chemins sont relatifs à l'adresse de l'application (`document.baseURI`), ce qui fonctionne aussi derrière le
sous-chemin de nginx outer. `fond-de-carte.ts` transforme la configuration pour MapLibre :

| Fonction | Rôle |
|---|---|
| `preparerMapLibre(base)` | Déclare le worker de MapLibre et le protocole `pmtiles://` (une seule fois) |
| `creerStyle(config, theme, base)` | Style complet du fond, variante claire ou sombre selon `ThemeService` |
| `optionsDeVue(config)` | Ajustement sur le territoire, zooms et contrainte de centre de la carte |
| `creerContrainte(config)` | Maintient le centre dans l'emprise et le zoom dans ses bornes (voir « Emprise du Maroc ») |

Le composant carte n'utilisera que ces fonctions : il ne connaît ni Protomaps ni l'emplacement des fichiers.

## Emprise du Maroc

Aucune coordonnée n'est saisie à la main : elles sont **calculées depuis une frontière officielle**.

| | |
|---|---|
| Source | [Natural Earth](https://github.com/nvkelso/natural-earth-vector), `geojson/ne_10m_admin_0_countries_mar.geojson` (échelle 1:10 000 000, version de juin 2022), domaine public |
| Périmètre | Version **« point de vue du Maroc »** : le territoire tel que le Maroc le définit, provinces du Sud comprises. Six polygones : le territoire principal et cinq petites enclaves ou îlots du littoral nord |
| Territoire | `[-17.104644, 20.766913, -1.031999, 35.926519]` : le minimum et le maximum des 1 075 sommets de la frontière |
| Marge | 0,5° (environ 55 km) sur les quatre côtés, arrondie à 3 décimales **vers l'extérieur** : `[-17.605, 20.266, -0.531, 36.427]` |

La marge a deux raisons : la frontière est généralisée à l'échelle 1:10 000 000 (le littoral et les limites ne sont
précis qu'à quelques kilomètres), et un marqueur placé près du bord ne doit pas être coupé.

**Recalculer** (autre version des données, autre point de vue, autre marge) :

```bash
node scripts/carte/calculer-emprise.mjs chemin/vers/ne_10m_admin_0_countries_mar.geojson
```

Le script réécrit `maroc.frontiere.json` (la frontière) et `emprise-maroc.json` (territoire et emprise), qui alimentent la
carte **et** `scripts/carte/preparer-fond-maroc.sh` : il n'existe qu'une seule valeur. `fond-de-carte.spec.ts` la
recalcule indépendamment à chaque exécution des tests : il échoue si le territoire n'est pas exactement la boîte
englobante de la frontière, si l'emprise n'est pas ce territoire plus 0,5° arrondi vers l'extérieur, ou si un seul
sommet de la frontière sort de l'emprise.

**Borne du centre, pas de l'écran.** MapLibre sait borner l'écran (`maxBounds`), mais il refuse alors que l'écran
dépasse l'emprise : sur un écran en paysage, il zoomerait jusqu'à couper le haut et le bas du Maroc (le territoire
est haut de 15°). La carte borne donc son **centre** à l'emprise (`creerContrainte`) : le Maroc entier s'affiche à
l'ouverture sur un téléphone, un petit écran et un écran de bureau (testé), et on ne peut pas s'en éloigner.

## Préparer le fond de carte

Le fond (archive du Maroc, polices, icônes) n'est **ni dans Git ni dans l'image Docker** : il pèse environ 590 Mo
(archive de 569 Mo au build du 2026-10-16, zoom 15) et se met à jour indépendamment du code. Le script a besoin de `git` et
de l'outil [`pmtiles`](https://github.com/protomaps/go-pmtiles/releases) dans le `PATH`, et du dépôt (il lit
`emprise-maroc.json`). Le dépôt n'est qu'une boîte à outils : la production n'a besoin que de `docker-compose.yml` et
de `.env`, plus le dossier du fond.

```bash
# Estimer la taille sans rien télécharger (--dry-run), avec les mêmes valeurs que le projet
pmtiles extract https://build.protomaps.com/20261016.pmtiles essai.pmtiles --bbox=-17.605,20.266,-0.531,36.427 --maxzoom=15 --dry-run

# Développement : servi par ng serve / ng test sous carte/fond/ (configuration development d'angular.json)
scripts/carte/preparer-fond-maroc.sh frontend/carte-fond

# Production : dans un dossier provisoire, puis copié dans CARTE_FOND_DIR
scripts/carte/preparer-fond-maroc.sh ./carte-fond 20261016
```

Le second argument est la date d'un build Protomaps (liste sur <https://maps.protomaps.com/builds>, défaut : hier).
Le script récupère d'abord les polices et les icônes de `protomaps/basemaps-assets` (petits, et vérifiés : un
fichier manquant arrête tout avant le gros téléchargement), puis extrait le Maroc jusqu'au zoom 15 (`pmtiles extract
--bbox`, emprise lue dans `emprise-maroc.json`). Il ne remplace le fond existant qu'en fin de traitement : un échec laisse
l'ancien en place. **Mettre à jour la carte** = relancer le script, puis recharger la page ; aucun redémarrage n'est
nécessaire (fichiers statiques).

### Sous Windows (serveur de production)

Le script est un script `sh` : le lancer avec **Git Bash** (inclus dans Git for Windows), après avoir placé
`pmtiles.exe` dans un dossier, par exemple `C:\outils\pmtiles` :

```powershell
& "C:\Program Files\Git\bin\bash.exe" -lc 'export PATH="$PATH:/c/outils/pmtiles"; cd /c/outils/Rh-ERP && scripts/carte/preparer-fond-maroc.sh /c/outils/carte-fond 20261016'
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
partielles (`Range`) qu'exige PMTiles, gérées nativement pour un fichier statique. Ces fichiers sont mis en cache une
heure au plus, et seulement les réponses réussies (un `404` n'est jamais gardé). Si le dossier est vide, la carte
s'affichera sans fond, avec le message d'erreur ci-dessus.

## Changer de fond

Fournir un autre `CARTE_CONFIG`, par exemple dans `app.config.ts` :

```ts
{ provide: CARTE_CONFIG, useValue: { ...CARTE_CONFIG_PAR_DEFAUT, fond: { ...FOND_DE_CARTE_PAR_DEFAUT, archive: 'https://tuiles.staport.ma/maroc.pmtiles' } } }
```

Tout fournisseur doit rester **gratuit et open source** (règle du projet). Avant d'utiliser un fond hébergé ailleurs que
par l'application, vérifier ses conditions d'usage et sa mention légale.

## Conditions d'usage

- Frontière du Maroc : Natural Earth, domaine public (aucune mention obligatoire).
- Données du fond : OpenStreetMap, licence ODbL. La mention « © OpenStreetMap » doit rester visible sur la carte.
- Styles Protomaps : CC0 ; code BSD-3-Clause. Polices : SIL OFL 1.1 ; icônes : MIT.
- Aucun service tiers n'est appelé à l'exécution : aucune clé, aucune limite, aucun coût.

## Limites connues

- **Périmètre à confirmer par la direction** : l'emprise suit le point de vue du Maroc de Natural Earth (provinces du Sud
  comprises). Un autre périmètre = une autre version du fichier source et le même script.
- La frontière est à l'échelle 1:10 000 000 : elle sert à calculer l'emprise, pas à localiser un chantier à quelques mètres.
- Le rendu des noms en arabe n'a pas été vu à l'écran. MapLibre 6 gère le texte de droite à gauche sans module
  supplémentaire (son plugin `rtl-text` est déprécié) ; à confirmer sur la carte déployée.
- Le fond n'a pas encore été vu à l'écran : l'environnement de développement de ces étapes n'a pas accès aux builds
  Protomaps. Les tests (`fond-de-carte.spec.ts`) vérifient le style, les adresses, le worker et le bornage sur une
  vraie carte WebGL, sans réseau. Le script a été testé avec un `pmtiles` simulé ; l'extraction réelle reste à lancer.
