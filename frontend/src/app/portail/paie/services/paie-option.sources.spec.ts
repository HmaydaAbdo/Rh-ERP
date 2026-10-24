import { of } from 'rxjs';

import { EQUIPE_ORPHELINE } from '../../../shared/reference-data/equipe-reference.model';
import { PaieEquipeOptionSource } from './paie-option.sources';

describe('PaieEquipeOptionSource', () => {
  it('propose les orphelins avec les équipes du référentiel', () => {
    const source = new PaieEquipeOptionSource(
      {} as never,
      {
        fetchPage: () => of({ items: [{ id: 5, code: 'OP', libelle: 'Opérateurs' }], totalRecords: 1 }),
        fetchById: (id: number | string) => of(Number(id) === 0 ? EQUIPE_ORPHELINE : { id: Number(id), code: 'OP', libelle: 'Opérateurs' })
      } as never,
      null,
      []
    );

    source.fetchPage(0, 30, '').subscribe((result) => {
      expect(result.items).toEqual([{ id: 5, code: 'OP', libelle: 'Opérateurs' }, EQUIPE_ORPHELINE]);
      expect(result.totalRecords).toBe(2);
    });
  });

  it('recherche Orphelins et résout son identifiant synthétique', () => {
    const paie = { rechercherOptionsEquipes: vi.fn().mockReturnValue(of({ content: [], page: { totalElements: 0 } })) };
    const filtre = new PaieEquipeOptionSource(paie as never, {} as never, '2026-09', [7]);

    filtre.fetchPage(0, 30, 'orphelin').subscribe((result) => {
      expect(result.items).toEqual([EQUIPE_ORPHELINE]);
      expect(result.totalRecords).toBe(1);
    });
    filtre.fetchById(0).subscribe((equipe) => expect(equipe).toEqual(EQUIPE_ORPHELINE));
    expect(paie.rechercherOptionsEquipes).toHaveBeenCalledWith('2026-09', [7], 0, 30, 'orphelin');
  });
});
