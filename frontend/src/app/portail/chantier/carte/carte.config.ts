import { InjectionToken } from '@angular/core';

/** Emprise géographique en longitude / latitude (WGS 84) : [ouest, sud, est, nord]. */
export type Emprise = readonly [ouest: number, sud: number, est: number, nord: number];

export interface FondDeCarte {
  /** Modèle d'URL des tuiles raster (`{z}/{x}/{y}`, sous-domaines `{a-d}` acceptés). */
  readonly url: string;
  /** Clé d'API du fournisseur, ajoutée à l'URL en paramètre `key` ; absente = aucun paramètre. */
  readonly cleApi?: string;
  /** Mention légale du fond, affichée sur la carte (texte statique de la configuration, jamais une donnée utilisateur). */
  readonly attribution: string;
}

export interface CarteConfig {
  readonly fond: FondDeCarte;
  /** La carte ne peut pas être déplacée hors de cette emprise. */
  readonly emprise: Emprise;
  /** Centre initial en [longitude, latitude]. */
  readonly centre: readonly [longitude: number, latitude: number];
  readonly zoomInitial: number;
  readonly zoomMin: number;
  readonly zoomMax: number;
}

/**
 * Fond CARTO « Positron » (clair, sobre : les marqueurs en couleur ressortent).
 * Les conditions d'usage et la clé d'API de CARTO sont à valider avant la mise en production
 * (voir docs/chantier/carte.md).
 */
export const FOND_DE_CARTE_PAR_DEFAUT: FondDeCarte = {
  url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  attribution:
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
};

/** Maroc, provinces du Sud comprises ; emprise approximative à valider par la direction. */
export const CARTE_CONFIG_PAR_DEFAUT: CarteConfig = {
  fond: FOND_DE_CARTE_PAR_DEFAUT,
  emprise: [-17.5, 20.5, -0.9, 36.1],
  centre: [-7.09, 31.79],
  zoomInitial: 6,
  zoomMin: 5,
  zoomMax: 18
};

/** Configuration de la carte ; pour changer de fond ou d'emprise, fournir ce jeton ailleurs que par défaut. */
export const CARTE_CONFIG = new InjectionToken<CarteConfig>('CARTE_CONFIG', {
  providedIn: 'root',
  factory: () => CARTE_CONFIG_PAR_DEFAUT
});
