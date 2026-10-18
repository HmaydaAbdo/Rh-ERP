import { TestBed } from '@angular/core/testing';
import { getWorkerUrl, LngLat, Map as CarteMapLibre } from 'maplibre-gl';

import { CARTE_CONFIG, CARTE_CONFIG_PAR_DEFAUT, FondDeCarte } from './carte.config';
import frontiere from './maroc.frontiere.json';
import { creerContrainte, creerStyle, optionsDeVue, preparerMapLibre, SOURCE_DU_FOND, urlAbsolue } from './fond-de-carte';

const BASE = 'https://rh.staport.ma/rh-erp/';

describe('fond de carte', () => {
  it('fournit par défaut la configuration du Maroc', () => {
    expect(TestBed.inject(CARTE_CONFIG)).toBe(CARTE_CONFIG_PAR_DEFAUT);
  });

  describe('urlAbsolue', () => {
    it("résout un chemin relatif sur l'adresse de l'application", () => {
      expect(urlAbsolue('carte/fond/maroc.pmtiles', BASE)).toBe('https://rh.staport.ma/rh-erp/carte/fond/maroc.pmtiles');
    });

    it('garde les marqueurs des modèles d’URL', () => {
      expect(urlAbsolue('carte/fond/fonts/{fontstack}/{range}.pbf', BASE)).toBe(
        'https://rh.staport.ma/rh-erp/carte/fond/fonts/{fontstack}/{range}.pbf'
      );
    });

    it('laisse une adresse absolue telle quelle', () => {
      expect(urlAbsolue('https://tuiles.exemple/maroc.pmtiles', BASE)).toBe('https://tuiles.exemple/maroc.pmtiles');
    });
  });

  describe('creerStyle', () => {
    it("lit l'archive auto-hébergée par le protocole pmtiles, avec l'attribution OpenStreetMap", () => {
      const source = creerStyle(CARTE_CONFIG_PAR_DEFAUT, 'light', BASE).sources[SOURCE_DU_FOND];
      expect(source).toEqual({
        type: 'vector',
        url: 'pmtiles://https://rh.staport.ma/rh-erp/carte/fond/maroc.pmtiles',
        attribution: CARTE_CONFIG_PAR_DEFAUT.fond.attribution
      });
      expect(CARTE_CONFIG_PAR_DEFAUT.fond.attribution).toContain('OpenStreetMap');
    });

    it('prend les polices et les icônes hébergées par l’application, sans service externe', () => {
      const style = creerStyle(CARTE_CONFIG_PAR_DEFAUT, 'light', BASE);
      expect(style.glyphs).toBe('https://rh.staport.ma/rh-erp/carte/fond/fonts/{fontstack}/{range}.pbf');
      expect(style.sprite).toBe('https://rh.staport.ma/rh-erp/carte/fond/sprites/v4/light');
    });

    it("suit le thème de l'application", () => {
      const clair = creerStyle(CARTE_CONFIG_PAR_DEFAUT, 'light', BASE);
      const sombre = creerStyle(CARTE_CONFIG_PAR_DEFAUT, 'dark', BASE);
      expect(sombre.sprite).toBe('https://rh.staport.ma/rh-erp/carte/fond/sprites/v4/dark');
      expect(sombre.layers).not.toEqual(clair.layers);
    });

    it('construit toutes les couches sur la source du fond', () => {
      const couches = creerStyle(CARTE_CONFIG_PAR_DEFAUT, 'light', BASE).layers;
      expect(couches.length).toBeGreaterThan(10);
      for (const couche of couches) {
        if ('source' in couche) {
          expect(couche.source).toBe(SOURCE_DU_FOND);
        }
      }
    });
  });

  it("ajuste la vue sur le territoire, avec les zooms configurés et une contrainte de centre", () => {
    const options = optionsDeVue(CARTE_CONFIG_PAR_DEFAUT);
    const [ouest, sud, est, nord] = CARTE_CONFIG_PAR_DEFAUT.territoire;
    expect(options.bounds).toEqual([
      [ouest, sud],
      [est, nord]
    ]);
    expect(options.fitBoundsOptions).toEqual({ padding: CARTE_CONFIG_PAR_DEFAUT.margeDeVuePx });
    expect(options.minZoom).toBe(CARTE_CONFIG_PAR_DEFAUT.zoomMin);
    expect(options.maxZoom).toBe(CARTE_CONFIG_PAR_DEFAUT.zoomMax);
    expect(options.transformConstrain).toBeTypeOf('function');
  });

  describe('creerContrainte', () => {
    const contrainte = creerContrainte(CARTE_CONFIG_PAR_DEFAUT);
    const [ouest, sud, est, nord] = CARTE_CONFIG_PAR_DEFAUT.emprise;

    it("laisse un centre de l'emprise tel quel", () => {
      const resultat = contrainte(new LngLat(-7, 32), 6);
      expect([resultat.center.lng, resultat.center.lat, resultat.zoom]).toEqual([-7, 32, 6]);
    });

    it("ramène à l'emprise un centre qui en sort, dans les quatre directions", () => {
      expect(contrainte(new LngLat(-40, 32), 6).center.lng).toBe(ouest);
      expect(contrainte(new LngLat(40, 32), 6).center.lng).toBe(est);
      expect(contrainte(new LngLat(-7, -50), 6).center.lat).toBe(sud);
      expect(contrainte(new LngLat(-7, 80), 6).center.lat).toBe(nord);
    });

    it('garde le zoom dans ses bornes', () => {
      expect(contrainte(new LngLat(-7, 32), 0).zoom).toBe(CARTE_CONFIG_PAR_DEFAUT.zoomMin);
      expect(contrainte(new LngLat(-7, 32), 22).zoom).toBe(CARTE_CONFIG_PAR_DEFAUT.zoomMax);
    });
  });

  // L'emprise n'est jamais saisie à la main : ces tests la recalculent, sans partager de code avec scripts/carte/calculer-emprise.mjs.
  describe('emprise du Maroc, calculée depuis la frontière', () => {
    const sommets = (frontiere.geometry.coordinates as number[][][][]).flatMap((polygone) => polygone.flat());
    const xs = sommets.map(([x]) => x);
    const ys = sommets.map(([, y]) => y);
    const { territoire, emprise } = CARTE_CONFIG_PAR_DEFAUT;

    it('utilise toute la frontière : territoire principal et enclaves', () => {
      expect(frontiere.geometry.type).toBe('MultiPolygon');
      expect(frontiere.geometry.coordinates.length).toBe(6);
      expect(sommets.length).toBeGreaterThan(1000);
    });

    it('a un territoire égal à la boîte englobante exacte de la frontière', () => {
      expect([...territoire]).toEqual([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    });

    it("a une emprise égale au territoire plus 0,5°, arrondie à 3 décimales vers l'extérieur", () => {
      const [ouest, sud, est, nord] = territoire;
      expect([...emprise]).toEqual([
        Math.floor((ouest - 0.5) * 1000) / 1000,
        Math.floor((sud - 0.5) * 1000) / 1000,
        Math.ceil((est + 0.5) * 1000) / 1000,
        Math.ceil((nord + 0.5) * 1000) / 1000
      ]);
    });

    it("contient chaque point de la frontière, avec au moins 0,5° de marge sur les quatre côtés", () => {
      const [ouest, sud, est, nord] = emprise;
      for (const [x, y] of sommets) {
        expect(x).toBeGreaterThanOrEqual(ouest + 0.5);
        expect(x).toBeLessThanOrEqual(est - 0.5);
        expect(y).toBeGreaterThanOrEqual(sud + 0.5);
        expect(y).toBeLessThanOrEqual(nord - 0.5);
      }
    });

    it('inclut les provinces du Sud (latitude 21° et moins) et le littoral méditerranéen', () => {
      expect(territoire[1]).toBeLessThan(21);
      expect(territoire[3]).toBeGreaterThan(35.9);
    });
  });

  describe('avec une carte réelle (WebGL, sans réseau)', () => {
    let conteneur: HTMLDivElement;
    let carte: CarteMapLibre | undefined;

    beforeEach(() => {
      preparerMapLibre(document.baseURI);
      conteneur = document.createElement('div');
      conteneur.style.cssText = 'width:400px;height:300px';
      document.body.append(conteneur);
    });

    afterEach(() => {
      carte?.remove();
      conteneur.remove();
    });

    it('déclare le worker copié dans le build, une seule fois', () => {
      const url = getWorkerUrl();
      preparerMapLibre('https://autre.exemple/');
      expect(url).toBe(urlAbsolue('carte/maplibre-gl-worker.mjs', document.baseURI));
      expect(getWorkerUrl()).toBe(url);
    });

    function creerCarte(): CarteMapLibre {
      return new CarteMapLibre({
        container: conteneur,
        style: { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#fff' } }] },
        attributionControl: false,
        ...optionsDeVue(CARTE_CONFIG_PAR_DEFAUT)
      });
    }

    it.each([
      ['un petit écran en paysage', 400, 300],
      ['un écran de bureau', 1280, 720],
      ['un téléphone en portrait', 360, 640]
    ])("affiche tout le territoire à l'ouverture sur %s", async (_nom, largeur, hauteur) => {
      conteneur.style.cssText = `width:${largeur}px;height:${hauteur}px`;
      carte = creerCarte();
      await carte.once('load');
      const visible = carte.getBounds();
      const [ouest, sud, est, nord] = CARTE_CONFIG_PAR_DEFAUT.territoire;
      for (const [longitude, latitude] of [[ouest, sud], [ouest, nord], [est, sud], [est, nord]]) {
        expect(visible.contains([longitude, latitude])).toBe(true);
      }
    });

    it("ne laisse pas sortir la carte de l'emprise du Maroc", async () => {
      carte = creerCarte();
      await carte.once('load');
      carte.jumpTo({ center: [-40, 60] });
      const { lng, lat } = carte.getCenter();
      const [ouest, sud, est, nord] = CARTE_CONFIG_PAR_DEFAUT.emprise;
      expect(lng).toBeGreaterThanOrEqual(ouest);
      expect(lng).toBeLessThanOrEqual(est);
      expect(lat).toBeGreaterThanOrEqual(sud);
      expect(lat).toBeLessThanOrEqual(nord);
    });
  });
});
