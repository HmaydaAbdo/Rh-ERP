import { hauteurPourLignes, libelleTranche, libelleTrancheTotal } from './graphiques-perimetre';

describe('libelleTranche', () => {
  it('écrit les âges borne haute incluse, l’ancienneté de borne à borne', () => {
    expect(libelleTranche({ min: 0, max: 25, effectif: 0 }, 'age')).toBe('moins de 25 ans');
    expect(libelleTranche({ min: 25, max: 35, effectif: 0 }, 'age')).toBe('25-34 ans');
    expect(libelleTranche({ min: 55, max: null, effectif: 0 }, 'age')).toBe('55 ans et plus');
    expect(libelleTranche({ min: 0, max: 1, effectif: 0 }, 'anciennete')).toBe('moins d’un an');
    expect(libelleTranche({ min: 1, max: 3, effectif: 0 }, 'anciennete')).toBe('1-3 ans');
  });
});

describe('libelleTrancheTotal', () => {
  it('écrit les bornes en dirhams, la dernière tranche étant ouverte', () => {
    expect(libelleTrancheTotal({ min: 1000, max: 2000, effectif: 0 })).toMatch(/^1\s000 – 2\s000 DH$/);
    expect(libelleTrancheTotal({ min: 5000, max: null, effectif: 0 })).toMatch(/^5\s000 DH et plus$/);
  });
});

describe('hauteurPourLignes', () => {
  it('garde une hauteur minimale et grandit avec le nombre de lignes', () => {
    expect(hauteurPourLignes(2)).toBe(10);
    expect(hauteurPourLignes(20)).toBeCloseTo(44);
  });
});
