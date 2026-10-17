import { layers, namedFlavor } from '@protomaps/basemaps';
import { addProtocol, getVersion, LngLat, setWorkerUrl, type LngLatBoundsLike, type MapOptions, type StyleSpecification, type TransformConstrainFunction } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

import type { Theme } from '../../../core/theme/theme.service';
import { CarteConfig } from './carte.config';

/** Nom de la source du fond dans le style ; les couches Protomaps s'y réfèrent. */
export const SOURCE_DU_FOND = 'protomaps';

/** Worker de MapLibre, copié dans le build par `angular.json` (MapLibre le cherche sinon à côté de son propre chunk). */
const WORKER_MAPLIBRE = 'carte/maplibre-gl-worker.mjs';

let mapLibrePrete = false;

/** Adresse absolue d'un chemin de la configuration, en gardant les marqueurs `{…}` des modèles d'URL. */
export function urlAbsolue(chemin: string, base: string): string {
  return new URL(chemin, base).href.replaceAll('%7B', '{').replaceAll('%7D', '}');
}

/** Déclare le worker et le protocole `pmtiles://` ; à appeler avant de créer une carte, sans effet les fois suivantes. */
export function preparerMapLibre(base: string): void {
  if (mapLibrePrete) {
    return;
  }
  // `?v=` : le nom du fichier ne change pas d'une version à l'autre ; le cache ne doit pas servir un ancien worker.
  const worker = new URL(urlAbsolue(WORKER_MAPLIBRE, base));
  worker.searchParams.set('v', getVersion());
  setWorkerUrl(worker.href);
  addProtocol('pmtiles', new Protocol().tile);
  mapLibrePrete = true;
}

/** Style du fond de carte pour le thème de l'application ; `base` est l'adresse de l'application (`document.baseURI`). */
export function creerStyle(config: CarteConfig, theme: Theme, base: string): StyleSpecification {
  const variante = theme === 'dark' ? 'dark' : 'light';
  return {
    version: 8,
    glyphs: urlAbsolue(config.fond.glyphes, base),
    sprite: `${urlAbsolue(config.fond.icones, base)}/${variante}`,
    sources: {
      [SOURCE_DU_FOND]: {
        type: 'vector',
        url: `pmtiles://${urlAbsolue(config.fond.archive, base)}`,
        attribution: config.fond.attribution
      }
    },
    layers: layers(SOURCE_DU_FOND, namedFlavor(variante), { lang: config.langue })
  };
}

/**
 * Contrainte de la carte : le **centre** reste dans l'emprise et le zoom dans ses bornes. On ne borne pas l'écran
 * (`maxBounds`) : MapLibre refuserait qu'il dépasse l'emprise et, sur un écran en paysage, zoomerait jusqu'à couper le haut
 * et le bas du Maroc.
 */
export function creerContrainte(config: CarteConfig): TransformConstrainFunction {
  const [ouest, sud, est, nord] = config.emprise;
  return (centre, zoom) => ({
    center: new LngLat(Math.min(Math.max(centre.lng, ouest), est), Math.min(Math.max(centre.lat, sud), nord)),
    zoom: Math.min(Math.max(zoom, config.zoomMin), config.zoomMax)
  });
}

/** Vue initiale, ajustée sur le territoire et bornée à son emprise. */
export function optionsDeVue(config: CarteConfig): Pick<MapOptions, 'bounds' | 'fitBoundsOptions' | 'minZoom' | 'maxZoom' | 'transformConstrain'> {
  const [ouest, sud, est, nord] = config.territoire;
  return {
    bounds: [
      [ouest, sud],
      [est, nord]
    ] satisfies LngLatBoundsLike,
    fitBoundsOptions: { padding: config.margeDeVuePx },
    minZoom: config.zoomMin,
    maxZoom: config.zoomMax,
    transformConstrain: creerContrainte(config)
  };
}
