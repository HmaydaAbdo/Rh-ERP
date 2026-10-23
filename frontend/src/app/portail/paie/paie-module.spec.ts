import { convertToParamMap } from '@angular/router';

import { MODULE_PAIE } from './paie-module';

const params = (valeurs: Record<string, string>) => convertToParamMap(valeurs);

describe('MODULE_PAIE', () => {
  it('n’a pas de référentiel propre et commence par la liste des mois', () => {
    expect(MODULE_PAIE.dimension).toBeNull();
    expect(MODULE_PAIE.catalogue).toBeUndefined();
    expect(MODULE_PAIE.niveauPeriode).toBe(true);
    expect(MODULE_PAIE.route).toBe('/paie');
  });

  it('applique le nom, le CIN, le périmètre et le mois aux bulletins', () => {
    const portee = { chantierIds: [3], equipeIds: [0], fonctionIds: undefined };

    expect(MODULE_PAIE.criterePaie(params({ nom: ' ali ', cin: 'AB1', periode: '2026-01' }), portee, '2026-08')).toEqual({
      nomPrenom: 'ali', cin: 'AB1', periode: '2026-08', chantierIds: [3], equipeIds: [0], fonctionIds: undefined
    });
  });

  it('demande tous les mois quand aucun mois n’est donné, même si l’URL en porte un', () => {
    expect(MODULE_PAIE.criterePaie(params({ periode: '2026-08' }), {}, null).periode).toBeUndefined();
  });

  it('applique le nom, le CIN et le périmètre aux fiches Employé', () => {
    expect(MODULE_PAIE.critereEmployes(params({ nom: 'ali', cin: 'AB1' }), { chantierIds: [3] })).toEqual({
      nomPrenom: 'ali', cin: 'AB1', chantierIds: [3], equipeIds: undefined, fonctionIds: undefined
    });
  });

  it('revient à la vue Tabulaire avec les filtres de la barre', () => {
    expect(MODULE_PAIE.parametresListe(params({ periode: '2026-08', nom: 'ali', chantierIds: '3,4' }))).toMatchObject({ periode: '2026-08', nom: 'ali', chantierIds: '3,4' });
  });
});
