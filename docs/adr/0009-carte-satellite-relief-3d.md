# ADR 0009 — Carte : le monde entier, imagerie satellite, relief et 3D

- **Statut** : accepté ; amende l'[ADR 0007](0007-maplibre-protomaps-auto-heberge.md) (le fond couvre le monde ; l'imagerie
  satellite est le seul service tiers)
- **Date** : 2026-10-18
- **Décideur** : propriétaire du projet

## Contexte

La direction attend une carte du niveau de Google Maps, présentable sans réserve : le monde entier, le zoom jusqu'au
bâtiment, une vue satellite, le relief et la 3D, fluide. Le propriétaire a fixé une seule condition : **la gratuité**.
La première carte se limitait au Maroc, s'arrêtait au zoom 15, sans relief, sans 3D et sans imagerie.

Le monde entier au zoom 15 pèse 139 Go (build Protomaps du 2026-10-17) : trop pour être servi tel quel. Les tailles d'un
extrait mondial, mesurées le 2026-10-18 : zoom 10 = 3,8 Go, 11 = 8 Go, 12 = 18 Go, 13 = 36 Go.

## Décision

| Besoin | Choix | Hébergement | Licence / conditions |
|---|---|---|---|
| Plan du monde | Une seule archive Protomaps : le **monde jusqu'au zoom 13** (toutes les rues, 36 Go) fusionnée (`pmtiles merge`) avec le **Maroc jusqu'au zoom 15** (bâtiments, commerces). Zoom réglable par `ZOOM_MONDE` selon le disque | **Auto-hébergé**, `carte/fond/monde.pmtiles` | ODbL, mention « © OpenStreetMap » |
| Zoom rue et bâtiment | Zoom maximal **19** ; au-delà du zoom de l'archive, MapLibre agrandit les tuiles vectorielles sans perte de netteté | — | — |
| Bâtiments 3D | `fill-extrusion` sur la hauteur OpenStreetMap (`height`, `min_height`), 6 m à défaut | — | ODbL |
| Relief : ombrage et terrain 3D | [Mapterhorn](https://mapterhorn.com) (Copernicus DEM et autres sources ouvertes) : monde jusqu'au zoom 8, Maroc jusqu'au zoom 11, fusionnés ; tuiles terrarium WebP de 512 px | **Auto-hébergé**, `carte/fond/monde-relief.pmtiles` | Données ouvertes ; mention « © Mapterhorn » |
| Imagerie satellite | Esri World Imagery, avec une **clé ArcGIS Location Platform gratuite et obligatoire** (2 000 000 tuiles par mois) : `docker compose` et `ng serve` refusent de démarrer sans elle | **Service tiers**, relayé par le nginx du frontend qui ajoute la clé : le navigateur ne voit jamais la clé | Mention « Esri, Maxar, Earthstar Geographics » obligatoire |
| Vue du monde | Projection **globe** vue de loin, avec atmosphère ; MapLibre repasse à plat en approchant | — | — |

Le relief Mapterhorn en 512 px au zoom 11 vaut un zoom 12 classique (environ 38 m par pixel) : suffisant pour l'ombrage
et le terrain 3D. L'ombrage s'efface entre les zooms 12 et 15, où ce modèle ne dessinerait que des taches.

Le relais de l'imagerie (`/carte/satellite/{z}/{y}/{x}`) n'accepte que des coordonnées de tuile en `GET` ; il résout
Esri à la demande (DNS de Docker), si bien que nginx démarre même sans accès à Esri. La clé est lue au démarrage du
conteneur (`ARCGIS_API_KEY`, modèle `frontend/nginx-templates/carte-satellite.conf.template`).

Écartés :

- **Tuiles publiques d'Esri sans clé comme source principale** : gratuites, mais leurs conditions réservent l'usage
  commercial hors des logiciels Esri à un compte ArcGIS ; la clé gratuite est donc obligatoire. Elles restent le
  **secours** : la carte n'y bascule que si le relais avec clé ne renvoie pas une image (quota dépassé, clé expirée,
  panne), pour que l'imagerie ne soit jamais coupée.

- **Google Maps Platform** : gratuit seulement sous un quota, carte bancaire et clé obligatoires, et ses conditions
  interdisent de mêler ses tuiles à un autre fond.
- **API Protomaps hébergée** : gratuite seulement pour un usage non commercial.
- **OpenFreeMap** (gratuit, sans clé, monde entier) : schéma de données différent de Protomaps (styles et thème sombre
  à refaire) et service financé par des dons ; reste une option de secours via `CARTE_CONFIG`.
- **Sentinel-2 cloudless d'EOX** : licence ouverte, mais 10 m par pixel.
- **Recherche de lieux** : reportée.

## Risques

- **Clé ArcGIS** : une clé d'API ArcGIS expire (un an au plus) ; la renouveler avant son échéance (voir
  docs/chantier/carte.md, « Clé ArcGIS »). Le compte n'a **aucun moyen de paiement** : rien ne peut être facturé, même lors d'un
  pic. Au-delà de 2 000 000 tuiles par mois, Esri refuse les tuiles ; la carte bascule alors sur le secours.
- **Accès à Internet du serveur** : l'imagerie passe par le serveur ; sans Internet, le plan et le relief restent
  disponibles.
- **Relais ouvert à qui atteint l'application** : comme le fond, les tuiles ne demandent pas de session. Le relais ne
  sert que des tuiles d'imagerie, et nginx outer n'expose l'application qu'au réseau prévu.

## Conséquences

- `scripts/carte/preparer-fond-maroc.sh` devient `scripts/carte/preparer-fond-carte.sh` : monde et Maroc, plan et
  relief. Le dossier `CARTE_FOND_DIR` passe à environ 40 Go (zoom 13) ; la préparation demande environ deux fois cet
  espace, et elle remplace les anciennes archives `maroc.pmtiles` et `maroc-relief.pmtiles`.
- `CARTE_CONFIG` gagne `relief`, `satellite` et `inclinaison3d`, perd `emprise` (la carte n'est plus bornée au Maroc) ;
  `zoomMin` passe à 1 et `zoomMax` à 19. L'emprise du Maroc reste calculée : elle délimite le Maroc détaillé.
- `docker-compose.yml` transmet `ARCGIS_API_KEY` au frontend ; l'image copie `nginx-templates/` dans `/etc/nginx/templates/`.
- Aucune `Content-Security-Policy` n'est à modifier : l'imagerie arrive par l'adresse de l'application.
