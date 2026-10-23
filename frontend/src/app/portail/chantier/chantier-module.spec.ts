import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { moduleChantier } from './chantier-module';
import { Chantier } from './models/chantier.model';

const params = (valeurs: Record<string, string>) => convertToParamMap(valeurs);
const CHANTIERS: Chantier[] = [
  { id: 1, version: 0, code: 'C168', designation: 'Route de Nador', nom: null, sourceErp: true, actif: true },
  { id: 2, version: 0, code: 'C196', designation: 'Marrakech', nom: 'Nord', sourceErp: false, actif: false }
];

describe('moduleChantier', () => {
  const recherche = vi.fn();
  const module = moduleChantier({ search: recherche } as never);

  beforeEach(() => {
    recherche.mockReset();
    recherche.mockReturnValue(of({ content: CHANTIERS, page: { size: 200, number: 0, totalElements: 2, totalPages: 1 } }));
  });

  it('décrit le module : référentiel de chantiers, descente chantier → équipe → fonction', () => {
    expect(module).toMatchObject({ cle: 'chantier', dimension: 'CHANTIER', route: '/chantiers', permission: 'CHANTIER_READ' });
    expect(module.ordre).toEqual(['CHANTIER', 'EQUIPE', 'FONCTION']);
  });

  it('charge le référentiel filtré par code, désignation et statut, et en fait des cartes avec leur statut', () => {
    let items: unknown;
    module.catalogue!.charger(params({ code: 'C1', designation: 'route', actif: 'true' })).subscribe((valeur) => (items = valeur));

    expect(recherche).toHaveBeenCalledWith({ code: 'C1', designation: 'route', actif: true }, { page: 0, size: 200, sort: 'code,asc' });
    expect(items).toEqual([
      { id: 1, code: 'C168', libelle: 'Route de Nador', detail: null, statut: { libelle: 'En cours', severite: 'success' } },
      { id: 2, code: 'C196', libelle: 'Nord', detail: 'Marrakech', statut: { libelle: 'Clôturé', severite: 'neutral' } }
    ]);
  });

  it('sait si un filtre restreint le référentiel et où mène la fiche', () => {
    expect(module.catalogue!.filtreActif(params({}))).toBe(false);
    expect(module.catalogue!.filtreActif(params({ actif: 'false' }))).toBe(true);
    expect(module.catalogue!.lien(2)).toEqual(['/chantiers', 2]);
  });

  it('revient à la vue Tabulaire avec ses filtres propres seulement', () => {
    expect(module.parametresListe(params({ code: 'C1', actif: 'false', chantierIds: '3' }))).toEqual({ code: 'C1', designation: null, actif: 'false' });
  });

  it('ne passe aux fiches et à la paie que le périmètre et le mois', () => {
    const portee = { chantierIds: [1], equipeIds: undefined, fonctionIds: [7] };

    expect(module.critereEmployes(params({ code: 'C1' }), portee)).toEqual({ chantierIds: [1], equipeIds: undefined, fonctionIds: [7] });
    expect(module.criterePaie(params({ code: 'C1' }), portee, '2026-08')).toEqual({ periode: '2026-08', chantierIds: [1], equipeIds: undefined, fonctionIds: [7] });
  });
});
