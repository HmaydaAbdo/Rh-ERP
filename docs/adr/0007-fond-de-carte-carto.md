# ADR 0007 — Fond de carte CARTO, configuré en un seul endroit

- **Statut** : accepté pour le développement ; **conditions de production à valider** (voir ci-dessous)
- **Date** : 2026-10-17
- **Décideur** : propriétaire du projet (recommandation de l'ADR 0006 suivie)

## Contexte

Les tuiles d'OpenStreetMap (`tile.openstreetmap.org`) exigent un en-tête `Referer`, alors que
`frontend/nginx.conf` envoie `Referrer-Policy: no-referrer` pour toute l'application. En production, ces tuiles
risquent d'être refusées, et leur usage n'est pas prévu pour un service professionnel continu. Assouplir l'en-tête
changerait la sécurité de toute l'application.

## Décision

- `nginx.conf` reste inchangé.
- Le fond par défaut est **CARTO « Positron »** (`light_all`, tuiles raster), clair et sobre, adapté à des marqueurs en
  couleur.
- L'adresse des tuiles, la clé d'API, l'attribution et l'emprise vivent dans **une seule configuration**
  (`portail/chantier/carte/carte.config.ts`, jeton `CARTE_CONFIG`). Changer de fond (autre fournisseur CARTO, tuiles
  auto-hébergées) ne demande aucune modification du composant carte.
- Emprise par défaut : Maroc, provinces du Sud comprises, `[-17.5, 20.5, -0.9, 36.1]` (ouest, sud, est, nord). Valeur
  approximative à confirmer par la direction.

## Conditions de CARTO (relevées le 2026-10-17, à confirmer)

- Une **clé d'API est requise** : sans clé, les tuiles s'affichent avec un filigrane « API key required ».
- Selon [la documentation de CARTO](https://github.com/CartoDB/basemap-styles), l'usage non commercial est gratuit
  jusqu'à 5 millions de tuiles par mois et l'usage commercial jusqu'à 1 million ; au-delà, une offre payante est
  nécessaire. D'autres sources (FAQ CARTO, forum) indiquent qu'une licence Enterprise est exigée pour un usage
  commercial : **les sources se contredisent**.
- Staport étant une entreprise, l'usage est probablement commercial.

## À faire avant la mise en production

1. Lire les [conditions de CARTO](https://carto.com/legal/basemap-terms/), obtenir une clé et confirmer par écrit
   le palier applicable à Staport, ou choisir des tuiles auto-hébergées.
2. Décider comment la clé est fournie à l'application : le frontend est un site statique sans configuration
   d'exécution, et une clé de tuiles est visible dans le navigateur. Aucun mécanisme n'est ajouté tant que ce choix
   n'est pas fait ; `cleApi` reste vide.
3. Vérifier que l'attribution « © OpenStreetMap contributors © CARTO » reste visible.

## Conséquences

- En développement, la carte fonctionne mais affiche le filigrane CARTO tant qu'aucune clé n'est configurée.
- Le blocage avant production est consigné dans `TODO.md`.
