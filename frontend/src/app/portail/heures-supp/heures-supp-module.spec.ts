import { convertToParamMap } from '@angular/router';

import { moduleHeuresSupp } from './heures-supp-module';

describe('moduleHeuresSupp', () => {
  it('déclare les trois dimensions, une seule source analytique et les permissions métier', () => {
    const module = moduleHeuresSupp();
    expect(module.ordre).toEqual(['CHANTIER', 'EQUIPE', 'FONCTION']);
    expect(module.ordreAnalytique).toEqual(['HEURES_SUP']);
    expect(module.sourcesAnalytique).toEqual(['HEURES_SUP']);
    expect(module.permission).toBe('HEURES_SUP_READ');
    expect(module.cartesHeuresSuppSeules).toBe(true);
  });

  it('reprend les filtres d’URL pour la liste et les agrégats', () => {
    const module = moduleHeuresSupp();
    const params = convertToParamMap({ periode: '2026-10', chantierIds: '2', equipeIds: '0', fonctionIds: '8', cin: 'AB', nom: 'Salma' });
    expect(module.parametresListe(params)).toEqual({ periode: '2026-10', chantierIds: '2', equipeIds: '0', fonctionIds: '8', cin: 'AB', nom: 'Salma' });
    expect(module.critereHeuresSupp?.(params, { chantierIds: [2], equipeIds: [0], fonctionIds: [8] }, '2026-10'))
      .toEqual({ periode: '2026-10', chantierIds: [2], equipeIds: [0], fonctionIds: [8], cin: 'AB', nomPrenom: 'Salma' });
  });

  it('ne délègue pas de critères de paie ou d’employés', () => {
    const module = moduleHeuresSupp();
    const params = convertToParamMap({});
    expect(module.critereEmployes(params, { chantierIds: [], equipeIds: [], fonctionIds: [] })).toEqual({});
    expect(module.criterePaie(params, { chantierIds: [], equipeIds: [], fonctionIds: [] }, null)).toEqual({});
  });
});
