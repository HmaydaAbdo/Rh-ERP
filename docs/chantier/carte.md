# Carte des chantiers

> Carte en lecture seule pour la direction, centrée et bornée sur le Maroc, avec ses propres permissions et son propre
> rôle (étape ultérieure). Construite par étapes, une PR par étape ; ce document décrit ce qui existe aujourd'hui.

| Étape | État |
|---|---|
| 1. Dépendance OpenLayers | Fait — [ADR 0006](../adr/0006-openlayers-carte-chantiers.md) |
| 2. Configuration du fond de carte et de l'emprise | Fait (ce document) |
| 3. Contrat de données `ChantierCarte` et source | À faire |
| 4. Composant carte, marqueurs, panneau « À localiser » | À faire |
| 5. Page, permissions et rôle dédiés, menu | À faire |

Aucun écran, aucune route et aucune permission n'existent encore.

## Configuration

Tout se règle dans `frontend/src/app/portail/chantier/carte/carte.config.ts`, jeton `CARTE_CONFIG`
(valeur par défaut `CARTE_CONFIG_PAR_DEFAUT`) :

| Champ | Rôle | Défaut |
|---|---|---|
| `fond.url` | Modèle d'URL des tuiles raster (`{z}/{x}/{y}`, sous-domaines `{a-d}`) | CARTO Positron (`light_all`) |
| `fond.cleApi` | Clé d'API du fournisseur, ajoutée en `?key=…` | vide |
| `fond.attribution` | Mention légale affichée sur la carte | OpenStreetMap contributors, CARTO |
| `emprise` | `[ouest, sud, est, nord]` en degrés ; la carte ne sort pas de cette emprise | Maroc `[-17.5, 20.5, -0.9, 36.1]` |
| `centre`, `zoomInitial`, `zoomMin`, `zoomMax` | Vue initiale | `[-7.09, 31.79]`, 6, 5, 18 |

`fond-de-carte.ts` transforme cette configuration en objets OpenLayers (`creerSourceDuFond`, `creerCoucheDeFond`,
`creerVue`, `urlDesTuiles`). Le futur composant carte n'utilisera que ces fonctions : il ne connaît ni CARTO ni
OpenStreetMap.

### Changer de fond de carte

Fournir un autre `CARTE_CONFIG` (par exemple dans `app.config.ts`) :

```ts
{ provide: CARTE_CONFIG, useValue: { ...CARTE_CONFIG_PAR_DEFAUT, fond: { url: 'https://tuiles.staport.ma/{z}/{x}/{y}.png', attribution: '© Staport' } } }
```

Une URL de tuiles hébergée ailleurs que chez le fournisseur par défaut peut exiger d'autoriser son domaine dans la
politique de sécurité du contenu, si l'application en reçoit une un jour (aucune aujourd'hui, voir `nginx.conf`).

## Conditions d'usage du fournisseur de tuiles

**À vérifier avant toute mise en production** : CARTO exige une clé d'API et des conditions commerciales qui
dépendent du volume ; les tuiles d'OpenStreetMap exigent un en-tête `Referer` que `nginx.conf` supprime. Détails et
décision dans l'[ADR 0007](../adr/0007-fond-de-carte-carto.md).

## Limites connues

- L'emprise du Maroc est approximative et doit être confirmée par la direction.
- Le fond n'a pas été vu à l'écran dans l'environnement de développement de cette étape : l'accès aux serveurs de
  tuiles y est bloqué. Les tests (`fond-de-carte.spec.ts`) vérifient l'URL, l'attribution, le centre et le
  bornage sans réseau.
