import { TestBed } from '@angular/core/testing';
import { fromLonLat, toLonLat } from 'ol/proj';

import { CARTE_CONFIG, CARTE_CONFIG_PAR_DEFAUT, FondDeCarte } from './carte.config';
import { creerCoucheDeFond, creerSourceDuFond, creerVue, empriseProjetee, urlDesTuiles } from './fond-de-carte';

const FOND: FondDeCarte = { url: 'https://tuiles.exemple/{z}/{x}/{y}.png', attribution: 'Fournisseur' };

describe('fond de carte', () => {
  describe('urlDesTuiles', () => {
    it("laisse l'URL telle quelle sans clé d'API", () => {
      expect(urlDesTuiles(FOND)).toBe(FOND.url);
    });

    it("ajoute la clé d'API en paramètre", () => {
      expect(urlDesTuiles({ ...FOND, cleApi: 'abc' })).toBe('https://tuiles.exemple/{z}/{x}/{y}.png?key=abc');
    });

    it("ajoute la clé avec & si l'URL a déjà un paramètre, et l'encode", () => {
      expect(urlDesTuiles({ ...FOND, url: `${FOND.url}?style=clair`, cleApi: 'a b' })).toBe(
        'https://tuiles.exemple/{z}/{x}/{y}.png?style=clair&key=a%20b'
      );
    });
  });

  it('fournit par défaut la configuration du Maroc', () => {
    expect(TestBed.inject(CARTE_CONFIG)).toBe(CARTE_CONFIG_PAR_DEFAUT);
  });

  it("utilise l'URL et l'attribution configurées pour la source du fond", () => {
    const source = creerSourceDuFond({ ...FOND, cleApi: 'k' });
    expect(source.getUrls()).toEqual(['https://tuiles.exemple/{z}/{x}/{y}.png?key=k']);
    expect(source.getAttributions()).not.toBeNull();
    expect(creerCoucheDeFond(source).getSource()).toBe(source);
  });

  describe('vue', () => {
    it("est centrée sur le Maroc, avec les zooms de l'emprise configurée", () => {
      const vue = creerVue(CARTE_CONFIG_PAR_DEFAUT);
      const [longitude, latitude] = toLonLat(vue.getCenter()!);
      expect(longitude).toBeCloseTo(CARTE_CONFIG_PAR_DEFAUT.centre[0], 4);
      expect(latitude).toBeCloseTo(CARTE_CONFIG_PAR_DEFAUT.centre[1], 4);
      expect(vue.getZoom()).toBe(CARTE_CONFIG_PAR_DEFAUT.zoomInitial);
      expect(vue.getMinZoom()).toBe(CARTE_CONFIG_PAR_DEFAUT.zoomMin);
      expect(vue.getMaxZoom()).toBe(CARTE_CONFIG_PAR_DEFAUT.zoomMax);
    });

    it("reste dans l'emprise lorsqu'on tente de déplacer la carte hors du Maroc", () => {
      const [ouest, sud, est, nord] = empriseProjetee(CARTE_CONFIG_PAR_DEFAUT.emprise);
      const vue = creerVue(CARTE_CONFIG_PAR_DEFAUT);
      vue.setCenter(fromLonLat([-40, 60]));
      const [x, y] = vue.getCenter()!;
      expect(x).toBeGreaterThanOrEqual(ouest);
      expect(x).toBeLessThanOrEqual(est);
      expect(y).toBeGreaterThanOrEqual(sud);
      expect(y).toBeLessThanOrEqual(nord);
    });

    it('contient le centre initial dans son emprise', () => {
      const [ouest, sud, est, nord] = empriseProjetee(CARTE_CONFIG_PAR_DEFAUT.emprise);
      const [x, y] = creerVue(CARTE_CONFIG_PAR_DEFAUT).getCenter()!;
      expect(x).toBeGreaterThan(ouest);
      expect(x).toBeLessThan(est);
      expect(y).toBeGreaterThan(sud);
      expect(y).toBeLessThan(nord);
    });
  });
});
