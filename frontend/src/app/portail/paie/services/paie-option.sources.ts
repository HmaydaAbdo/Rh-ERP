import { Observable, map, of } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../../../shared/components/lazy-select/lazy-select.model';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EQUIPE_ORPHELINE, EquipeReference, rechercheEquipeOrpheline } from '../../../shared/reference-data/equipe-reference.model';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { PaieService } from './paie.service';

/** Source paginée des chantiers du mois choisi, pour les filtres partagés des vues Paie. */
export class PaieChantierOptionSource implements LazySelectSource<ChantierReference> {
  constructor(
    private readonly paieService: PaieService,
    private readonly references: ChantierReferenceService,
    private readonly periode: string
  ) {}

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<ChantierReference>> {
    return this.paieService.rechercherOptionsChantiers(this.periode, page, size, search).pipe(
      map((result) => ({ items: result.content, totalRecords: result.page.totalElements }))
    );
  }

  fetchById(id: number | string): Observable<ChantierReference> {
    return this.references.fetchById(id);
  }
}

/** Source paginée des équipes ayant des bulletins sur les chantiers sélectionnés ce mois. */
export class PaieEquipeOptionSource implements LazySelectSource<EquipeReference> {
  constructor(
    private readonly paieService: PaieService,
    private readonly references: EquipeReferenceService,
    private readonly periode: string | null,
    private readonly chantierIds: number[]
  ) {}

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<EquipeReference>> {
    const page$ = this.periode && this.chantierIds.length > 0
      ? this.paieService.rechercherOptionsEquipes(this.periode, this.chantierIds, page, size, search).pipe(
        map((result) => ({ items: result.content, totalRecords: result.page.totalElements }))
      )
      : this.references.fetchPage(page, size, search);
    return page$.pipe(map((result) => this.ajouterOrphelins(result, page, search)));
  }

  fetchById(id: number | string): Observable<EquipeReference> {
    if (Number(id) === 0) {
      return of(EQUIPE_ORPHELINE);
    }
    return this.references.fetchById(id);
  }

  private ajouterOrphelins(result: LazySelectPage<EquipeReference>, page: number, search: string): LazySelectPage<EquipeReference> {
    if (page !== 0 || result.items.some((equipe) => equipe.id === EQUIPE_ORPHELINE.id)) return result;
    return !search.trim() || rechercheEquipeOrpheline(search)
      ? { items: [...result.items, EQUIPE_ORPHELINE], totalRecords: result.totalRecords + 1 }
      : result;
  }
}
