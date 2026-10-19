import { couleurEvolution, couleurMesure, libelleEvolutionMesure, libelleMesure } from './paie-chart-theme';

describe('paie-chart-theme', () => {
  const racine = document.documentElement;

  afterEach(() => {
    racine.style.removeProperty('--chart-1');
    racine.style.removeProperty('--chart-2');
    racine.style.removeProperty('--chart-3');
    racine.style.removeProperty('--chart-4');
  });

  it('la masse est toujours la couleur 1, les bulletins la couleur 2', () => {
    racine.style.setProperty('--chart-1', 'blue');
    racine.style.setProperty('--chart-2', 'orange');

    expect(couleurMesure('masse')).toBe('blue');
    expect(couleurMesure('effectif')).toBe('orange');
  });

  it('nomme chaque mesure comme les infobulles et les tableaux de données', () => {
    expect(libelleMesure('masse')).toBe('Masse (DH)');
    expect(libelleMesure('effectif')).toBe('Bulletins');
  });

  it('distingue les deux unités STC dans l’évolution', () => {
    racine.style.setProperty('--chart-3', 'green');
    racine.style.setProperty('--chart-4', 'goldenrod');

    expect(couleurEvolution('stc')).toBe('green');
    expect(couleurEvolution('stcMontant')).toBe('goldenrod');
    expect(libelleEvolutionMesure('stc')).toBe('STC (personnes)');
    expect(libelleEvolutionMesure('stcMontant')).toBe('STC (DH)');
  });
});
