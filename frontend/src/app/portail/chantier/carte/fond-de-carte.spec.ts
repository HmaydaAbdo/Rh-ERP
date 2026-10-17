import { TestBed } from '@angular/core/testing';
import { getVersion, getWorkerUrl, Map as CarteMapLibre } from 'maplibre-gl';

import { CARTE_CONFIG, CARTE_CONFIG_PAR_DEFAUT } from './carte.config';
import { creerStyle, optionsDeVue, preparerMapLibre, SOURCE_DU_FOND, urlAbsolue } from './fond-de-carte';

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

  it('borne la vue à l’emprise configurée', () => {
    expect(optionsDeVue(CARTE_CONFIG_PAR_DEFAUT)).toEqual({
      center: [-7.09, 31.79],
      zoom: 5,
      minZoom: 4,
      maxZoom: 17,
      maxBounds: [
        [-17.5, 20.5],
        [-0.9, 36.1]
      ]
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

    it('déclare le worker copié dans le build, versionné, une seule fois', () => {
      const url = getWorkerUrl();
      preparerMapLibre('https://autre.exemple/');
      expect(url).toBe(`${urlAbsolue('carte/maplibre-gl-worker.mjs', document.baseURI)}?v=${getVersion()}`);
      expect(getWorkerUrl()).toBe(url);
    });

    it("ne laisse pas sortir la carte de l'emprise du Maroc", async () => {
      carte = new CarteMapLibre({
        container: conteneur,
        style: { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#fff' } }] },
        attributionControl: false,
        ...optionsDeVue(CARTE_CONFIG_PAR_DEFAUT)
      });
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
