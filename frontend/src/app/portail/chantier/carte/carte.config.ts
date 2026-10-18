import { InjectionToken } from '@angular/core';

import empriseMaroc from './emprise-maroc.json';

/** Emprise géographique en longitude / latitude (WGS 84) : [ouest, sud, est, nord]. */
export type Emprise = readonly [ouest: number, sud: number, est: number, nord: number];

/**
 * Fond de carte auto-hébergé (Protomaps) : une archive PMTiles, ses polices et ses icônes, servies par l'application
 * elle-même. Les chemins sont relatifs à l'adresse de l'application ou absolus.
 */
export interface FondDeCarte {
  /** Archive PMTiles du fond (tuiles vectorielles). */
  readonly archive: string;
  /** Zoom maximal de l'archive ; au-delà, MapLibre agrandit les tuiles vectorielles sans perte de netteté. */
  readonly zoomMaxArchive: number;
  /** Modèle des polices des libellés (`{fontstack}` et `{range}` sont remplacés par MapLibre). */
  readonly glyphes: string;
  /** Dossier des icônes ; la variante claire ou sombre y est ajoutée selon le thème. */
  readonly icones: string;
  /** Mention légale affichée sur la carte (texte statique de la configuration, jamais une donnée utilisateur). */
  readonly attribution: string;
}

/** Relief auto-hébergé (Mapterhorn) : modèle numérique de terrain en tuiles « terrarium », pour l'ombrage et la 3D. */
export interface ReliefDeCarte {
  /** Archive PMTiles du relief (images WebP de 512 px, encodage terrarium). */
  readonly archive: string;
  readonly zoomMaxArchive: number;
  /** Exagération verticale du terrain 3D (1 = réel) : les reliefs restent lisibles vus de loin. */
  readonly exageration: number;
  readonly attribution: string;
}

/**
 * Imagerie satellite (Esri World Imagery, voir l'ADR 0009) : tuiles raster XYZ, relayées par le serveur de l'application,
 * qui ajoute la clé ArcGIS : la clé n'arrive jamais au navigateur.
 */
export interface SatelliteDeCarte {
  /** Modèle d'URL des tuiles (`{z}`, `{x}`, `{y}`), relatif à l'adresse de l'application ou absolu. */
  readonly tuiles: string;
  /** Tuiles de secours (mêmes images, sans clé), demandées seulement si `tuiles` ne renvoie pas une image. */
  readonly tuilesDeSecours: string;
  readonly zoomMaxSource: number;
  readonly attribution: string;
}

export interface CarteConfig {
  readonly fond: FondDeCarte;
  readonly relief: ReliefDeCarte;
  readonly satellite: SatelliteDeCarte;
  /** Boîte englobante du territoire : la vue initiale et la « Vue d'ensemble » s'y ajustent, quelle que soit la taille de l'écran. */
  readonly territoire: Emprise;
  /** Espace laissé autour du territoire à l'ouverture de la carte, en pixels. */
  readonly margeDeVuePx: number;
  readonly zoomMin: number;
  /** Zoom maximal de la carte (niveau de la rue et du bâtiment). */
  readonly zoomMax: number;
  /** Inclinaison de la vue 3D, en degrés. */
  readonly inclinaison3d: number;
  /** Langue des libellés ; à défaut de nom dans cette langue, le nom local est affiché. */
  readonly langue: string;
}

/**
 * Fichiers produits par `scripts/carte/preparer-fond-carte.sh`, servis sous `carte/fond/` (voir docs/chantier/carte.md) : le monde
 * entier, et le Maroc jusqu'au zoom 15.
 */
export const FOND_DE_CARTE_PAR_DEFAUT: FondDeCarte = {
  archive: 'carte/fond/monde.pmtiles',
  zoomMaxArchive: 15,
  glyphes: 'carte/fond/fonts/{fontstack}/{range}.pbf',
  icones: 'carte/fond/sprites/v4',
  attribution:
    '<a href="https://github.com/protomaps/basemaps" target="_blank" rel="noopener">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
};

const RELIEF_PAR_DEFAUT: ReliefDeCarte = {
  archive: 'carte/fond/monde-relief.pmtiles',
  zoomMaxArchive: 11,
  exageration: 1.4,
  attribution: '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn</a>'
};

const SATELLITE_PAR_DEFAUT: SatelliteDeCarte = {
  // Relais de nginx (docker compose) et du proxy de développement (proxy.conf.js, ng serve) vers Esri.
  tuiles: 'carte/satellite/{z}/{y}/{x}',
  tuilesDeSecours: 'carte/satellite-secours/{z}/{y}/{x}',
  // L'imagerie existe au zoom 18 partout où elle est détaillée ; au-delà, MapLibre agrandit plutôt que d'afficher la tuile
  // « données non disponibles » d'Esri dans les zones moins couvertes.
  zoomMaxSource: 18,
  attribution: 'Imagerie © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics'
};

/**
 * Le monde entier, ouvert sur le Maroc, provinces du Sud comprises (frontière Natural Earth, point de vue du Maroc). Le
 * territoire est calculé par `scripts/carte/calculer-emprise.mjs` et vérifié contre la frontière par `fond-de-carte.spec.ts` :
 * ne jamais le saisir à la main (voir docs/chantier/carte.md, « Emprise du Maroc »).
 */
export const CARTE_CONFIG_PAR_DEFAUT: CarteConfig = {
  fond: FOND_DE_CARTE_PAR_DEFAUT,
  relief: RELIEF_PAR_DEFAUT,
  satellite: SATELLITE_PAR_DEFAUT,
  territoire: empriseMaroc.territoire as unknown as Emprise,
  margeDeVuePx: 24,
  zoomMin: 1,
  zoomMax: 19,
  inclinaison3d: 60,
  langue: 'fr'
};

/** Configuration de la carte ; pour changer de fond ou d'emprise, fournir ce jeton (par exemple dans `app.config.ts`). */
export const CARTE_CONFIG = new InjectionToken<CarteConfig>('CARTE_CONFIG', {
  providedIn: 'root',
  factory: () => CARTE_CONFIG_PAR_DEFAUT
});
