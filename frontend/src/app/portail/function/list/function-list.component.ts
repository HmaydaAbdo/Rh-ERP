import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, finalize, map, skip } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { FunctionFiltres, lireFiltresFunction, memesFiltresFunction } from '../filtres/function-filtres';
import { Function } from '../models/function.model';
import { FunctionService } from '../services/function.service';

/** Vue tabulaire des fonctions. Le filtre vient de l'URL (voir `FunctionVuesComponent`) ; l'import et la création sont dans l'en-tête de la page. */
@Component({
  selector: 'app-function-list',
  imports: [ButtonComponent, ColumnChooserComponent, TableComponent, TableCellDirective, TableRowActionsDirective],
  templateUrl: './function-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunctionListComponent {
  readonly columns = new ColumnState([{ field: 'libelle', header: 'Libellé' }]);

  private readonly functionService = inject(FunctionService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('FUNCTION_WRITE'));
  protected readonly canDelete = computed(() => this.authService.hasPermission('FUNCTION_DELETE'));

  protected readonly functions = signal<Function[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);

  private filtres: FunctionFiltres = lireFiltresFunction(this.route.snapshot.queryParamMap);

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'libelle,asc';

  constructor() {
    this.route.queryParamMap
      .pipe(map(lireFiltresFunction), skip(1), distinctUntilChanged(memesFiltresFunction), takeUntilDestroyed(this.destroyRef))
      .subscribe((filtres) => {
        this.filtres = filtres;
        this.onSearch();
      });
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows;
    this.lastPage = size > 0 ? Math.floor(event.first / size) : 0;
    this.lastSize = size;
    this.lastSort = event.sortField ? `${event.sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.fetchPage();
  }

  protected onSearch(): void {
    this.lastPage = 0;
    this.fetchPage();
  }

  protected onView(fonction: Function): void {
    this.router.navigate(['/functions', fonction.id]);
  }

  protected onEdit(fonction: Function): void {
    this.router.navigate(['/functions', fonction.id, 'edit']);
  }

  protected onDelete(fonction: Function): void {
    this.confirmationService.confirm({
      header: 'Supprimer cette fonction',
      message: `Confirmez-vous la suppression de ${fonction.libelle} ?`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteFunction(fonction)
    });
  }

  private deleteFunction(fonction: Function): void {
    this.deletingId.set(fonction.id);
    this.functionService
      .delete(fonction.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Fonction supprimée', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);

    this.functionService
      .search({ libelle: this.filtres.libelle || undefined }, { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.functions.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
