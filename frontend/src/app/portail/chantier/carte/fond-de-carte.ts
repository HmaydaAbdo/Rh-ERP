import { layers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import {
  addProtocol,
  setWorkerUrl,
  type AddProtocolAction,
  type ExpressionSpecification,
  type LayerSpecification,
  type LngLatBoundsLike,
  type MapOptions,
  type SkySpecification,
  type SourceSpecification,
  type StyleSpecification
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';

import type { Theme } from '../../../core/theme/theme.service';
import { CarteConfig } from './carte.config';

/** Nom de la source du fond dans le style ; les couches Protomaps s'y réfèrent. */
export const SOURCE_DU_FOND = 'protomaps';
/** Source du relief (modèle numérique de terrain) pour le terrain 3D. */
export const SOURCE_DU_RELIEF = 'relief';
/** Même archive, source distincte pour l'ombrage : MapLibre dessine moins bien l'ombrage quand il partage la source du terrain 3D. */
const SOURCE_DE_L_OMBRAGE = 'relief-ombrage';
/** Source de l'imagerie satellite. */
export const SOURCE_SATELLITE = 'satellite';
/** Protocole des tuiles satellite : relais principal, puis relais de secours (voir `tuileSatellite`). */
const PROTOCOLE_SATELLITE = 'satellite';

/** Fond affiché : le plan vectoriel, ou l'imagerie satellite avec les frontières, les grands axes et les libellés du plan. */
export type TypeDeFond = 'plan' | 'satellite';

/** Ce que l'utilisateur a choisi d'afficher ; le style est une fonction pure de ce choix, du thème et de la configuration. */
export interface Affichage {
  readonly fond: TypeDeFond;
  /** Ombrage du relief et terrain 3D. */
  readonly relief: boolean;
}

export const AFFICHAGE_PAR_DEFAUT: Affichage = { fond: 'plan', relief: true };

/** Hauteur prêtée à un bâtiment dont OpenStreetMap ne donne pas la hauteur, en mètres (un rez-de-chaussée et un étage). */
const HAUTEUR_BATIMENT_PAR_DEFAUT_M = 6;
/** Zoom à partir duquel les bâtiments ont leur pleine hauteur ; ils s'élèvent progressivement depuis le zoom précédent. */
const ZOOM_BATIMENTS_3D = 15;

/** Zoom auquel l'ombrage du relief a disparu. */
const ZOOM_FIN_OMBRAGE = 15;

/** Worker de MapLibre, copié dans le build par `angular.json` (MapLibre le cherche sinon à côté de son propre chunk). */
const WORKER_MAPLIBRE = 'carte/maplibre-gl-worker.mjs';

/** Feuille de style de MapLibre (contrôles, mention légale), copiée dans le build par `angular.json` : trop lourde (83 Ko) pour un style de composant.
 * Worker et feuille n'ont pas de version dans leur adresse (le serveur de développement la refuse) : nginx les fait revalider à chaque ouverture. */
const FEUILLE_MAPLIBRE = 'carte/maplibre-gl.css';

/**
 * Message de l'erreur levée pour une tuile absente de l'archive : ce n'est pas une panne, la carte ne doit pas la signaler.
 * L'archive est complète jusqu'à un zoom pour le monde et au-delà pour le Maroc ; hors du Maroc, les tuiles de grand zoom
 * n'existent pas. Répondre par une erreur, comme un serveur de tuiles, fait afficher par MapLibre la tuile parente agrandie
 * (rues, relief) au lieu d'un trou ou d'un relief à plat.
 */
export const TUILE_ABSENTE = 'Tuile absente de l’archive';

let mapLibrePrete = false;

/** Adresse absolue d'un chemin de la configuration, en gardant les marqueurs `{…}` des modèles d'URL. */
export function urlAbsolue(chemin: string, base: string): string {
  return new URL(chemin, base).href.replaceAll('%7B', '{').replaceAll('%7D', '}');
}

/**
 * Tuile satellite : demandée au relais principal (avec la clé ArcGIS) ; si la réponse n'est pas une image (Esri répond à un
 * refus — quota dépassé, clé expirée — par un JSON en 200, jamais par un code d'erreur) ou si le relais est en panne, la carte
 * bascule sur le relais de secours (tuiles publiques, sans clé) et y reste pour le reste de la session.
 */
export function tuileSatellite(principal: string, secours: string): AddProtocolAction {
  let surLeSecours = false;
  const chercher = async (modele: string, z: string, y: string, x: string, signal: AbortSignal): Promise<ArrayBuffer | undefined> => {
    const reponse = await fetch(modele.replace('{z}', z).replace('{y}', y).replace('{x}', x), { signal });
    return reponse.ok && reponse.headers.get('Content-Type')?.startsWith('image/') ? reponse.arrayBuffer() : undefined;
  };
  return async (requete, controleur) => {
    const [z, y, x] = requete.url.slice(`${PROTOCOLE_SATELLITE}://`.length).split('/');
    if (!surLeSecours) {
      try {
        const image = await chercher(principal, z, y, x, controleur.signal);
        if (image) {
          return { data: image };
        }
      } catch (erreur) {
        if (controleur.signal.aborted) {
          throw erreur;
        }
      }
      surLeSecours = true;
    }
    const image = await chercher(secours, z, y, x, controleur.signal);
    if (!image) {
      throw new Error("L'imagerie satellite n'a pas répondu");
    }
    return { data: image };
  };
}

/**
 * Déclare le worker, les protocoles `pmtiles://` et `satellite://` et la feuille de style ; à appeler avant de créer une carte,
 * sans effet les fois suivantes.
 * La feuille est insérée **en tête** du document : les styles de l'application, déclarés après, l'emportent à spécificité égale
 * (sinon `.maplibregl-map { position: relative }` écrase le positionnement du conteneur, qui prend une hauteur nulle).
 */
export function preparerMapLibre(config: CarteConfig, base: string): void {
  if (mapLibrePrete) {
    return;
  }
  setWorkerUrl(urlAbsolue(WORKER_MAPLIBRE, base));
  const protocole = new Protocol();
  const tuile: AddProtocolAction = async (requete, controleur) => {
    const reponse = await protocole.tilev4(requete, controleur);
    // Absente : vide pour une tuile vectorielle, nulle pour une image (relief). Le descripteur de l'archive (json) passe tel quel.
    if (requete.type !== 'json' && (reponse.data === null || (reponse.data instanceof Uint8Array && reponse.data.byteLength === 0))) {
      throw new Error(TUILE_ABSENTE);
    }
    return reponse as Awaited<ReturnType<AddProtocolAction>>;
  };
  addProtocol('pmtiles', tuile);
  addProtocol(PROTOCOLE_SATELLITE, tuileSatellite(urlAbsolue(config.satellite.tuiles, base), urlAbsolue(config.satellite.tuilesDeSecours, base)));
  const feuille = document.createElement('link');
  feuille.rel = 'stylesheet';
  feuille.href = urlAbsolue(FEUILLE_MAPLIBRE, base);
  document.head.prepend(feuille);
  mapLibrePrete = true;
}

/** Style complet de la carte pour le thème et l'affichage choisis ; `base` est l'adresse de l'application (`document.baseURI`). */
export function creerStyle(config: CarteConfig, theme: Theme, base: string, affichage: Affichage = AFFICHAGE_PAR_DEFAUT): StyleSpecification {
  const variante = theme === 'dark' ? 'dark' : 'light';
  const sources: Record<string, SourceSpecification> = {
    [SOURCE_DU_FOND]: {
      type: 'vector',
      url: `pmtiles://${urlAbsolue(config.fond.archive, base)}`,
      attribution: config.fond.attribution
    }
  };
  if (affichage.relief) {
    const relief: SourceSpecification = {
      type: 'raster-dem',
      url: `pmtiles://${urlAbsolue(config.relief.archive, base)}`,
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: config.relief.zoomMaxArchive,
      attribution: config.relief.attribution
    };
    sources[SOURCE_DU_RELIEF] = relief;
    sources[SOURCE_DE_L_OMBRAGE] = relief;
  }
  if (affichage.fond === 'satellite') {
    sources[SOURCE_SATELLITE] = {
      type: 'raster',
      tiles: [`${PROTOCOLE_SATELLITE}://{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: config.satellite.zoomMaxSource,
      attribution: config.satellite.attribution
    };
  }

  return {
    version: 8,
    glyphs: urlAbsolue(config.fond.glyphes, base),
    // Sur l'imagerie, les libellés sont ceux du thème sombre (texte clair, halo foncé) : les icônes les suivent.
    sprite: `${urlAbsolue(config.fond.icones, base)}/${affichage.fond === 'satellite' ? 'dark' : variante}`,
    sources,
    layers: affichage.fond === 'satellite' ? couchesSatellite(config, affichage) : couchesPlan(config, variante, affichage),
    // Globe vu de loin, à plat en approchant (MapLibre passe de l'un à l'autre au fil du zoom).
    projection: { type: 'globe' },
    sky: ciel(variante),
    ...(affichage.relief ? { terrain: { source: SOURCE_DU_RELIEF, exaggeration: config.relief.exageration } } : {})
  };
}

/** Plan vectoriel Protomaps : ombrage du relief sous l'eau et les routes, bâtiments en volume. */
function couchesPlan(config: CarteConfig, variante: 'light' | 'dark', affichage: Affichage): LayerSpecification[] {
  const flavor = namedFlavor(variante);
  const couches = layers(SOURCE_DU_FOND, flavor, { lang: config.langue }).map((couche) =>
    couche.id === 'buildings' ? batiments3d(flavor) : couche
  );
  // Le fond n'apparaît qu'avant l'arrivée des tuiles : la couleur de l'eau évite un éclair gris au chargement.
  const coucheFond = couches.find((couche) => couche.id === 'background');
  if (coucheFond?.type === 'background') {
    coucheFond.paint = { ...coucheFond.paint, 'background-color': flavor.water };
  }
  if (affichage.relief) {
    couches.splice(
      couches.findIndex((couche) => couche.id === 'water'),
      0,
      ombrage(variante === 'dark' ? 0.35 : 0.45, variante)
    );
  }
  return couches;
}

/** Libellés lisibles sur n'importe quelle image : texte blanc, halo sombre. */
const LIBELLES_SUR_IMAGERIE = { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0, 0, 0, 0.8)', 'text-halo-width': 1.4 };

/** Imagerie satellite, puis frontières, grands axes et libellés du plan (vue « hybride »). */
function couchesSatellite(config: CarteConfig, affichage: Affichage): LayerSpecification[] {
  const flavor = namedFlavor('dark');
  const traces = layers(SOURCE_DU_FOND, flavor, { lang: config.langue })
    .filter((couche) => ['boundaries_country', 'boundaries', 'roads_highway', 'roads_major'].includes(couche.id))
    .map((couche) => (couche.type === 'line' ? { ...couche, paint: { ...couche.paint, 'line-opacity': 0.55 } } : couche));
  return [
    { id: 'background', type: 'background', paint: { 'background-color': flavor.background } },
    { id: 'satellite', type: 'raster', source: SOURCE_SATELLITE },
    ...(affichage.relief ? [ombrage(0.2, 'dark')] : []),
    ...traces,
    ...layers(SOURCE_DU_FOND, flavor, { lang: config.langue, labelsOnly: true }).map((couche) =>
      couche.type === 'symbol' ? { ...couche, paint: { ...couche.paint, ...LIBELLES_SUR_IMAGERIE } } : couche
    )
  ];
}

/** Bâtiments en volume, à leur hauteur OpenStreetMap ; ils s'élèvent progressivement en approchant du niveau de la rue. */
function batiments3d(flavor: Flavor): LayerSpecification {
  const hauteur: ExpressionSpecification = ['coalesce', ['get', 'height'], HAUTEUR_BATIMENT_PAR_DEFAUT_M];
  const base: ExpressionSpecification = ['coalesce', ['get', 'min_height'], 0];
  return {
    id: 'buildings',
    type: 'fill-extrusion',
    source: SOURCE_DU_FOND,
    'source-layer': 'buildings',
    filter: ['in', ['get', 'kind'], ['literal', ['building', 'building_part']]],
    paint: {
      'fill-extrusion-color': flavor.buildings,
      'fill-extrusion-opacity': 0.85,
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], ZOOM_BATIMENTS_3D - 1, 0, ZOOM_BATIMENTS_3D, hauteur],
      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], ZOOM_BATIMENTS_3D - 1, 0, ZOOM_BATIMENTS_3D, base],
      'fill-extrusion-vertical-gradient': true
    }
  };
}

/**
 * Ombrage du relief, lumière venue du nord-ouest ; discret, pour ne pas concurrencer les données. Il s'efface en approchant de
 * la rue : le modèle de terrain, agrandi au-delà de sa résolution, n'y dessinerait que des taches.
 */
function ombrage(intensite: number, variante: 'light' | 'dark'): LayerSpecification {
  const ombre = variante === 'dark' ? '#000000' : '#5a5a6e';
  return {
    id: 'relief',
    type: 'hillshade',
    source: SOURCE_DE_L_OMBRAGE,
    paint: {
      'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], ZOOM_FIN_OMBRAGE - 3, intensite, ZOOM_FIN_OMBRAGE, 0],
      'hillshade-shadow-color': ombre,
      'hillshade-accent-color': ombre,
      'hillshade-highlight-color': variante === 'dark' ? '#3a4a5a' : '#ffffff'
    }
  };
}

/** Ciel et brume quand la carte est inclinée ; atmosphère autour du globe vu de loin, qui s'efface en approchant. */
function ciel(variante: 'light' | 'dark'): SkySpecification {
  const melange: SkySpecification = {
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.7,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0]
  };
  return variante === 'dark'
    ? { 'sky-color': '#0b1a2b', 'horizon-color': '#1f3650', 'fog-color': '#14202c', ...melange }
    : { 'sky-color': '#7fb4e6', 'horizon-color': '#e6f0f8', 'fog-color': '#eef2f5', ...melange };
}

/** Le territoire entier, en boîte englobante MapLibre : vue initiale et retour à la vue d'ensemble. */
export function territoire(config: CarteConfig): LngLatBoundsLike {
  const [ouest, sud, est, nord] = config.territoire;
  return [
    [ouest, sud],
    [est, nord]
  ];
}

/** Vue initiale, ajustée sur le territoire ; la carte peut ensuite parcourir le monde entier. */
export function optionsDeVue(config: CarteConfig): Pick<MapOptions, 'bounds' | 'fitBoundsOptions' | 'minZoom' | 'maxZoom' | 'maxPitch'> {
  return {
    bounds: territoire(config),
    fitBoundsOptions: { padding: config.margeDeVuePx },
    minZoom: config.zoomMin,
    maxZoom: config.zoomMax,
    maxPitch: 80
  };
}
