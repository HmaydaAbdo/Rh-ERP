import { convertToParamMap } from '@angular/router';

import { AUCUN_FILTRE, EmployeeFiltres, lireFiltres, versCriteres, versParametres } from './employee-filtres';

describe('filtres des employés (URL)', () => {
  it("lit tous les filtres d'une URL", () => {
    const filtres = lireFiltres(convertToParamMap({ nom: 'ali', cin: 'AB1', fonctionIds: '7', chantierIds: '3,4', equipeIds: '2', statut: 'INACTIF' }));

    expect(filtres).toEqual({ nomPrenom: 'ali', cin: 'AB1', fonctionIds: [7], chantierIds: [3, 4], equipeIds: [2], statut: 'INACTIF' });
  });

  it('ignore les valeurs invalides', () => {
    const filtres = lireFiltres(convertToParamMap({ chantierIds: 'x,-2,1.5,0', fonctionIds: '', equipeIds: '-1', statut: 'SUSPENDU' }));

    expect(filtres).toEqual(AUCUN_FILTRE);
  });

  it('garde zéro seulement pour l’équipe : « sans équipe »', () => {
    const filtres = lireFiltres(convertToParamMap({ chantierIds: '0', equipeIds: '0, 2' }));

    expect(filtres.chantierIds).toEqual([]);
    expect(filtres.equipeIds).toEqual([0, 2]);
  });

  it("écrit des paramètres vides à null pour les retirer de l'URL", () => {
    expect(versParametres(AUCUN_FILTRE)).toEqual({ nom: null, cin: null, fonctionIds: null, chantierIds: null, equipeIds: null, statut: null });
  });

  it("relit ce qu'il a écrit", () => {
    const filtres: EmployeeFiltres = { nomPrenom: 'ali', cin: 'AB1', fonctionIds: [7], chantierIds: [3, 4], equipeIds: [0, 5], statut: 'ACTIF' };

    const params = Object.fromEntries(Object.entries(versParametres(filtres)).filter(([, valeur]) => valeur !== null));

    expect(lireFiltres(convertToParamMap(params))).toEqual(filtres);
  });

  it("transmet à l'API undefined pour un filtre absent et retire les espaces autour du texte", () => {
    const criteres = versCriteres({ ...AUCUN_FILTRE, nomPrenom: ' ali ', chantierIds: [3], equipeIds: [0] });

    expect(criteres).toEqual({ nomPrenom: 'ali', cin: undefined, fonctionIds: undefined, chantierIds: [3], equipeIds: [0], statut: undefined });
  });
});
