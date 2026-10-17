import TileLayer from 'ol/layer/Tile';
import { fromLonLat, transformExtent } from 'ol/proj';
import XYZ from 'ol/source/XYZ';
import View from 'ol/View';

import { CarteConfig, Emprise, FondDeCarte } from './carte.config';

const PROJECTION_CARTE = 'EPSG:3857';

/** URL des tuiles du fond, avec la clé d'API du fournisseur lorsqu'elle est configurée. */
export function urlDesTuiles(fond: FondDeCarte): string {
  if (!fond.cleApi) {
    return fond.url;
  }
  const separateur = fond.url.includes('?') ? '&' : '?';
  return `${fond.url}${separateur}key=${encodeURIComponent(fond.cleApi)}`;
}

/** Emprise convertie dans la projection de la carte. */
export function empriseProjetee(emprise: Emprise): number[] {
  return transformExtent([...emprise], 'EPSG:4326', PROJECTION_CARTE);
}

/** Source des tuiles du fond ; l'appelant écoute `tileloaderror` pour signaler un échec de chargement. */
export function creerSourceDuFond(fond: FondDeCarte): XYZ {
  return new XYZ({
    url: urlDesTuiles(fond),
    attributions: fond.attribution,
    crossOrigin: 'anonymous'
  });
}

export function creerCoucheDeFond(source: XYZ): TileLayer<XYZ> {
  return new TileLayer({ source });
}

/** Vue centrée sur le territoire et bornée à son emprise. */
export function creerVue(config: CarteConfig): View {
  return new View({
    center: fromLonLat([...config.centre]),
    zoom: config.zoomInitial,
    minZoom: config.zoomMin,
    maxZoom: config.zoomMax,
    extent: empriseProjetee(config.emprise)
  });
}
