import { layers, namedFlavor } from '@protomaps/basemaps';
import { addProtocol, getVersion, setWorkerUrl, type MapOptions, type StyleSpecification } from 'maplibre-gl';
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

/** Vue initiale, centrée sur le territoire et bornée à son emprise. */
export function optionsDeVue(config: CarteConfig): Pick<MapOptions, 'center' | 'zoom' | 'minZoom' | 'maxZoom' | 'maxBounds'> {
  const [ouest, sud, est, nord] = config.emprise;
  return {
    center: [...config.centre],
    zoom: config.zoomInitial,
    minZoom: config.zoomMin,
    maxZoom: config.zoomMax,
    maxBounds: [
      [ouest, sud],
      [est, nord]
    ]
  };
}
