import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { moduleFunction } from './function-module';

const params = (valeurs: Record<string, string>) => convertToParamMap(valeurs);

describe('moduleFunction', () => {
  const recherche = vi.fn();
  const module = moduleFunction({ search: recherche } as never);

  beforeEach(() => {
    recherche.mockReset();
    recherche.mockReturnValue(of({ content: [{ id: 7, version: 0, libelle: 'MACON' }], page: { size: 200, number: 0, totalElements: 1, totalPages: 1 } }));
  });

  it('décrit le module : référentiel de fonctions, descente fonction → chantier → équipe', () => {
    expect(module).toMatchObject({ cle: 'function', dimension: 'FONCTION', route: '/functions', permission: 'FUNCTION_READ' });
    expect(module.ordre).toEqual(['FONCTION', 'CHANTIER', 'EQUIPE']);
  });

  it('charge le référentiel filtré par libellé ; une fonction n’a pas de code', () => {
    let items: unknown;
    module.catalogue!.charger(params({ libelle: 'mac' })).subscribe((valeur) => (items = valeur));

    expect(recherche).toHaveBeenCalledWith({ libelle: 'mac' }, { page: 0, size: 200, sort: 'libelle,asc' });
    expect(items).toEqual([{ id: 7, code: null, libelle: 'MACON', detail: null, statut: null }]);
  });

  it('sait si un filtre restreint le référentiel et où mène la fiche', () => {
    expect(module.catalogue!.filtreActif(params({}))).toBe(false);
    expect(module.catalogue!.filtreActif(params({ libelle: 'mac' }))).toBe(true);
    expect(module.catalogue!.lien(7)).toEqual(['/functions', 7]);
  });

  it('revient à la vue Tabulaire avec son filtre propre, et passe le périmètre aux fiches et à la paie', () => {
    const portee = { chantierIds: [3], equipeIds: undefined, fonctionIds: [7] };

    expect(module.parametresListe(params({ libelle: 'mac', fonctionIds: '7' }))).toEqual({ libelle: 'mac' });
    expect(module.critereEmployes(params({}), portee)).toEqual({ chantierIds: [3], equipeIds: undefined, fonctionIds: [7] });
    expect(module.criterePaie(params({}), portee, null)).toEqual({ periode: undefined, chantierIds: [3], equipeIds: undefined, fonctionIds: [7] });
  });
});
