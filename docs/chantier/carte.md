# Carte des chantiers

> Carte en lecture seule pour la direction, centrée et bornée sur le Maroc, avec ses propres permissions et son propre
> rôle (étape ultérieure). Uniquement des solutions gratuites et open source : MapLibre GL JS et un fond Protomaps
> **auto-hébergé** — voir l'[ADR 0007](../adr/0007-maplibre-protomaps-auto-heberge.md). Construite par étapes, une PR
> par étape ; ce document décrit ce qui existe aujourd'hui.

| Étape | État |
|---|---|
| 1. Moteur de carte (`maplibre-gl`, `pmtiles`, `@protomaps/basemaps`) | Fait |
| 2. Configuration du fond auto-hébergé, du thème et de l'emprise | Fait |
| 3. Contrat de données `ChantierCarte` et source | À faire |
| 4. Composant carte, marqueurs, panneau « À localiser » | À faire |
| 5. Page, permissions et rôle dédiés, menu | À faire |

Aucun écran, aucune route et aucune permission n'existent encore.

## Configuration

Tout se règle dans `frontend/src/app/portail/chantier/carte/carte.config.ts`, jeton `CARTE_CONFIG`
(valeur par défaut `CARTE_CONFIG_PAR_DEFAUT`) :

| Champ | Rôle | Défaut |
|---|---|---|
| `fond.archive` | Archive PMTiles du fond (tuiles vectorielles) | `carte/fond/maroc.pmtiles` |
| `fond.glyphes` | Modèle des polices des libellés | `carte/fond/fonts/{fontstack}/{range}.pbf` |
| `fond.icones` | Dossier des icônes ; `light` ou `dark` y est ajouté selon le thème | `carte/fond/sprites/v4` |
| `fond.attribution` | Mention légale affichée sur la carte (obligatoire : données OpenStreetMap, ODbL) | Protomaps, © OpenStreetMap |
| `emprise` | `[ouest, sud, est, nord]` en degrés ; la carte n'en sort pas | Maroc `[-17.5, 20.5, -0.9, 36.1]` |
| `centre`, `zoomInitial`, `zoomMin`, `zoomMax` | Vue initiale | `[-7.09, 31.79]`, 5, 4, 17 |
| `langue` | Langue des libellés (à défaut, nom local) | `fr` |

Les chemins sont relatifs à l'adresse de l'application (`document.baseURI`), ce qui fonctionne aussi derrière le
sous-chemin de nginx outer. `fond-de-carte.ts` transforme la configuration pour MapLibre :

| Fonction | Rôle |
|---|---|
| `preparerMapLibre(base)` | Déclare le worker de MapLibre et le protocole `pmtiles://` (une seule fois) |
| `creerStyle(config, theme, base)` | Style complet du fond, variante claire ou sombre selon `ThemeService` |
| `optionsDeVue(config)` | Centre, zooms et borne (`maxBounds`) de la carte |

Le futur composant carte n'utilisera que ces fonctions : il ne connaît ni Protomaps ni l'emplacement des fichiers.

## Préparer le fond de carte

Le fond (archive du Maroc, polices, icônes) n'est **ni dans Git ni dans l'image Docker** : il pèse plusieurs centaines
de Mo et se met à jour indépendamment du code. Prérequis : `git` et l'outil
[`pmtiles`](https://github.com/protomaps/go-pmtiles/releases) dans le `PATH`.

```bash
# Développement : servi par ng serve / ng test sous carte/fond/ (configuration development d'angular.json)
scripts/carte/preparer-fond-maroc.sh frontend/carte-fond

# Production : dans le dossier CARTE_FOND_DIR du serveur (défaut ./carte-fond), monté en lecture seule dans le frontend
scripts/carte/preparer-fond-maroc.sh ./carte-fond 20261015
```

Le second argument est la date d'un build Protomaps (liste sur <https://maps.protomaps.com/builds>, défaut : hier).
Le script extrait le Maroc jusqu'au zoom 15 (`pmtiles extract --bbox`, emprise identique à `CARTE_CONFIG_PAR_DEFAUT`)
et récupère les polices et icônes de `protomaps/basemaps-assets`. Il ne remplace le fond existant qu'en fin de
traitement : un échec laisse l'ancien en place. **Mettre à jour la carte** = relancer le script, puis recharger la page ;
aucun redémarrage n'est nécessaire (fichiers statiques).

En production, nginx sert ces fichiers sous `/carte/fond/` avec les requêtes partielles (`Range`) qu'exige PMTiles,
gérées nativement pour un fichier statique. Ces fichiers sont mis en cache une heure au plus (pas de cache « immuable » : leurs noms ne
changent pas d'une mise à jour à l'autre). Si le dossier est vide, la carte s'affichera sans fond (état d'erreur
prévu à l'étape 4).

## Changer de fond

Fournir un autre `CARTE_CONFIG`, par exemple dans `app.config.ts` :

```ts
{ provide: CARTE_CONFIG, useValue: { ...CARTE_CONFIG_PAR_DEFAUT, fond: { ...FOND_DE_CARTE_PAR_DEFAUT, archive: 'https://tuiles.staport.ma/maroc.pmtiles' } } }
```

Tout fournisseur doit rester **gratuit et open source** (règle du projet). Avant d'utiliser un fond hébergé ailleurs que
par l'application, vérifier ses conditions d'usage et sa mention légale.

## Conditions d'usage

- Données : OpenStreetMap, licence ODbL. La mention « © OpenStreetMap » doit rester visible sur la carte.
- Styles Protomaps : CC0 ; code BSD-3-Clause. Polices : SIL OFL 1.1 ; icônes : MIT.
- Aucun service tiers n'est appelé à l'exécution : aucune clé, aucune limite, aucun coût.

## Limites connues

- L'emprise du Maroc est approximative et doit être confirmée par la direction.
- Le module de rendu de l'arabe de MapLibre (`@mapbox/mapbox-gl-rtl-text`) sera ajouté avec le composant carte :
  sans lui, les noms en arabe s'afficheraient mal formés.
- Le fond n'a pas encore été vu à l'écran : l'environnement de développement de ces étapes n'a pas accès aux builds
  Protomaps. Les tests (`fond-de-carte.spec.ts`) vérifient le style, les adresses, le worker et le bornage sur une
  vraie carte WebGL, sans réseau. Le script a été testé avec un `pmtiles` simulé ; l'extraction réelle reste à lancer.
