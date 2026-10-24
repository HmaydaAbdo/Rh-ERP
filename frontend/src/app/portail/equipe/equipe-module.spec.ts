import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { moduleEquipe } from './equipe-module';

const params = (valeurs: Record<string, string>) => convertToParamMap(valeurs);

describe('moduleEquipe', () => {
  const recherche = vi.fn();
  const module = moduleEquipe({ search: recherche } as never);

  beforeEach(() => {
    recherche.mockReset();
    recherche.mockReturnValue(of({ content: [{ id: 5, version: 0, code: 'CH', libelle: 'Chauffeurs' }], page: { size: 200, number: 0, totalElements: 1, totalPages: 1 } }));
  });

  it('décrit le module : référentiel d’équipes, descente équipe → chantier → fonction', () => {
    expect(module).toMatchObject({ cle: 'equipe', dimension: 'EQUIPE', route: '/equipes', permission: 'EQUIPE_READ' });
    expect(module.ordre).toEqual(['EQUIPE', 'CHANTIER', 'FONCTION']);
    expect(module).toMatchObject({
      sourcesAnalytique: ['PAIE'], vueEffectifParDimension: true, periodePaieRecenteFixe: true,
      sansRaccourciListe: true, sansRaccourciCartes: true, sansLienEmployes: true, lienEmployesPresDuNiveau: true,
      resumeCartesPresDuNiveau: true, sansOrphelinsDansCartes: true, afficherQualiteOrphelins: true
    });
  });

  it('charge le référentiel filtré par code et libellé', () => {
    let items: unknown;
    module.catalogue!.charger(params({ code: 'CH', libelle: 'chauf' })).subscribe((valeur) => (items = valeur));

    expect(recherche).toHaveBeenCalledWith({ code: 'CH', libelle: 'chauf' }, { page: 0, size: 200, sort: 'libelle,asc' });
    expect(items).toEqual([{ id: 5, code: 'CH', libelle: 'Chauffeurs', detail: null, statut: null }]);
  });

  it('sait si un filtre restreint le référentiel et où mène la fiche', () => {
    expect(module.catalogue!.filtreActif(params({}))).toBe(false);
    expect(module.catalogue!.filtreActif(params({ libelle: 'x' }))).toBe(true);
    expect(module.catalogue!.lien(5)).toEqual(['/equipes', 5]);
  });

  it('revient à la vue Tabulaire avec ses filtres propres, et passe le périmètre aux fiches et à la paie', () => {
    const portee = { chantierIds: undefined, equipeIds: [0], fonctionIds: undefined };

    expect(module.parametresListe(params({ code: 'CH', equipeIds: '5' }))).toEqual({ code: 'CH', libelle: null });
    expect(module.critereEmployes(params({}), portee)).toEqual({ chantierIds: undefined, equipeIds: [0], fonctionIds: undefined });
    expect(module.criterePaie(params({}), portee, '2026-08')).toEqual({ periode: '2026-08', chantierIds: undefined, equipeIds: [0], fonctionIds: undefined });
  });
});
