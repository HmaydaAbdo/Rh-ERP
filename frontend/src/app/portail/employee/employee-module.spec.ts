import { convertToParamMap } from '@angular/router';

import { MODULE_EMPLOYE } from './employee-module';

const params = (valeurs: Record<string, string>) => convertToParamMap(valeurs);

describe('MODULE_EMPLOYE', () => {
  it('n’a pas de référentiel propre : son périmètre est celui de sa barre', () => {
    expect(MODULE_EMPLOYE.dimension).toBeNull();
    expect(MODULE_EMPLOYE.catalogue).toBeUndefined();
    expect(MODULE_EMPLOYE.sansLienEmployes).toBe(true);
  });

  it('applique nom, CIN et statut aux fiches, nom et CIN aux bulletins', () => {
    const p = params({ nom: ' ali ', cin: 'AB1', statut: 'ACTIF' });
    const portee = { chantierIds: [3], equipeIds: undefined, fonctionIds: [7] };

    expect(MODULE_EMPLOYE.critereEmployes(p, portee)).toEqual({
      nomPrenom: 'ali', cin: 'AB1', statut: 'ACTIF', chantierIds: [3], equipeIds: undefined, fonctionIds: [7]
    });
    expect(MODULE_EMPLOYE.criterePaie(p, portee, '2026-08')).toEqual({
      nomPrenom: 'ali', cin: 'AB1', periode: '2026-08', chantierIds: [3], equipeIds: undefined, fonctionIds: [7]
    });
  });

  it('revient à la vue Tabulaire avec les filtres de la barre', () => {
    expect(MODULE_EMPLOYE.parametresListe(params({ nom: 'ali', chantierIds: '3,4' }))).toMatchObject({ nom: 'ali', chantierIds: '3,4' });
  });

  it('prévient que nom, CIN et statut ne s’appliquent pas aux mouvements de la paie', () => {
    expect(MODULE_EMPLOYE.noteMouvements?.(params({ statut: 'ACTIF' }))).toContain('ne s’appliquent pas');
    expect(MODULE_EMPLOYE.noteMouvements?.(params({}))).toBeNull();
  });
});
