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
  /** Modèle des polices des libellés (`{fontstack}` et `{range}` sont remplacés par MapLibre). */
  readonly glyphes: string;
  /** Dossier des icônes ; la variante claire ou sombre y est ajoutée selon le thème. */
  readonly icones: string;
  /** Mention légale affichée sur la carte (texte statique de la configuration, jamais une donnée utilisateur). */
  readonly attribution: string;
}

export interface CarteConfig {
  readonly fond: FondDeCarte;
  /** Boîte englobante du territoire : la vue initiale s'y ajuste, quelle que soit la taille de l'écran. */
  readonly territoire: Emprise;
  /** La carte ne peut pas être déplacée hors de cette emprise (le territoire et sa marge). */
  readonly emprise: Emprise;
  /** Espace laissé autour du territoire à l'ouverture de la carte, en pixels. */
  readonly margeDeVuePx: number;
  readonly zoomMin: number;
  /** Zoom maximal ; au-delà du zoom maximal de l'archive, MapLibre agrandit les dernières tuiles. */
  readonly zoomMax: number;
  /** Langue des libellés ; à défaut de nom dans cette langue, le nom local est affiché. */
  readonly langue: string;
}

/** Fichiers produits par `scripts/carte/preparer-fond-maroc.sh`, servis sous `carte/fond/` (voir docs/chantier/carte.md). */
export const FOND_DE_CARTE_PAR_DEFAUT: FondDeCarte = {
  archive: 'carte/fond/maroc.pmtiles',
  glyphes: 'carte/fond/fonts/{fontstack}/{range}.pbf',
  icones: 'carte/fond/sprites/v4',
  attribution:
    '<a href="https://github.com/protomaps/basemaps" target="_blank" rel="noopener">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
};

/**
 * Maroc, provinces du Sud comprises (frontière Natural Earth, point de vue du Maroc). Le territoire et l'emprise sont
 * calculés par `scripts/carte/calculer-emprise.mjs` et vérifiés contre la frontière par `fond-de-carte.spec.ts` :
 * ne jamais les saisir à la main (voir docs/chantier/carte.md, « Emprise du Maroc »).
 */
export const CARTE_CONFIG_PAR_DEFAUT: CarteConfig = {
  fond: FOND_DE_CARTE_PAR_DEFAUT,
  territoire: empriseMaroc.territoire as unknown as Emprise,
  emprise: empriseMaroc.emprise as unknown as Emprise,
  margeDeVuePx: 24,
  zoomMin: 3,
  zoomMax: 17,
  langue: 'fr'
};

/** Configuration de la carte ; pour changer de fond ou d'emprise, fournir ce jeton (par exemple dans `app.config.ts`). */
export const CARTE_CONFIG = new InjectionToken<CarteConfig>('CARTE_CONFIG', {
  providedIn: 'root',
  factory: () => CARTE_CONFIG_PAR_DEFAUT
});
