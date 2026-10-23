import { convertToParamMap } from '@angular/router';

import {
  etapeChoisie, lirePerimetre, niveauAffiche, porteeDe, porteeVide, versParametresPerimetre
} from './perimetre';

const params = (valeurs: Record<string, string>) => convertToParamMap(valeurs);
const ORDRE = ['CHANTIER', 'EQUIPE', 'FONCTION'] as const;

describe('lirePerimetre', () => {
  it('lit les identifiants et le mois de l’URL, « 0 » désignant les bulletins sans équipe', () => {
    expect(lirePerimetre(params({ chantierIds: '3,4', equipeIds: '0', fonctionIds: '7', periode: '2026-08' }))).toEqual({
      chantierIds: [3, 4], equipeIds: [0], fonctionIds: [7], periode: '2026-08'
    });
  });

  it('ignore les valeurs invalides : identifiants non entiers ou négatifs, mois mal formé, « 0 » hors équipe', () => {
    expect(lirePerimetre(params({ chantierIds: 'a,-2,0,5', equipeIds: '-1,x', fonctionIds: '0', periode: '2026-13' }))).toEqual({
      chantierIds: [5], equipeIds: [], fonctionIds: [], periode: null
    });
  });
});

describe('étapes et portée', () => {
  it('ne compte comme étape qu’une dimension portant exactement une valeur', () => {
    const perimetre = lirePerimetre(params({ chantierIds: '3', equipeIds: '4,5' }));

    expect(etapeChoisie(perimetre, 'CHANTIER')).toBe(3);
    expect(etapeChoisie(perimetre, 'EQUIPE')).toBeNull();
    expect(etapeChoisie(perimetre, 'FONCTION')).toBeNull();
  });

  it('ne restreint pas une dimension sans identifiant et détecte une restriction vide', () => {
    const portee = porteeDe(lirePerimetre(params({ chantierIds: '3' })));

    expect(portee).toEqual({ chantierIds: [3], equipeIds: undefined, fonctionIds: undefined });
    expect(porteeVide(portee)).toBe(false);
    expect(porteeVide({ chantierIds: [] })).toBe(true);
  });

  it('remet le périmètre en paramètres d’URL, en retirant les vides', () => {
    expect(versParametresPerimetre({ chantierIds: [3, 4], equipeIds: [], fonctionIds: [], periode: '2026-08' })).toEqual({
      chantierIds: '3,4', equipeIds: null, fonctionIds: null, periode: '2026-08'
    });
  });
});

describe('niveauAffiche', () => {
  const niveau = (url: Record<string, string>, avecMois = false, fiches = true) => {
    const p = params(url);
    return niveauAffiche(p, lirePerimetre(p), ORDRE, avecMois, fiches);
  };

  it('prend la première dimension de l’ordre pas encore choisie', () => {
    expect(niveau({})).toBe('CHANTIER');
    expect(niveau({ chantierIds: '1' })).toBe('EQUIPE');
    expect(niveau({ chantierIds: '1', equipeIds: '2' })).toBe('FONCTION');
    expect(niveau({ chantierIds: '1', equipeIds: '2', fonctionIds: '3' })).toBe('EMPLOYES');
  });

  it('garde le niveau demandé s’il est possible et l’ignore sinon', () => {
    expect(niveau({ par: 'fonction' })).toBe('FONCTION');
    expect(niveau({ chantierIds: '1', par: 'chantier' })).toBe('EQUIPE');
    expect(niveau({ par: 'employes' })).toBe('EMPLOYES');
    expect(niveau({ par: 'employes' }, false, false)).toBe('CHANTIER');
    expect(niveau({ par: 'inconnu' })).toBe('CHANTIER');
  });

  it('s’arrête au dernier regroupement sans droit sur les fiches', () => {
    expect(niveau({ chantierIds: '1', equipeIds: '2', fonctionIds: '3' }, false, false)).toBe('FONCTION');
  });

  it('commence par la liste des mois tant qu’aucun mois n’est choisi (module Paie)', () => {
    expect(niveau({}, true)).toBe('PERIODE');
    expect(niveau({ chantierIds: '1' }, true)).toBe('PERIODE');
    expect(niveau({ periode: '2026-08' }, true)).toBe('CHANTIER');
    expect(niveau({ periode: '2026-08', par: 'periode' }, true)).toBe('CHANTIER');
    expect(niveau({ par: 'chantier' }, true)).toBe('CHANTIER');
  });
});
