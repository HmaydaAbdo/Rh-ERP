import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';

const DEBOUNCE_RECHERCHE_MS = 300;

@Component({
  selector: 'app-equipe-list',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, ColumnChooserComponent, TableComponent, TableCellDirective, TableRowActionsDirective],
  templateUrl: './equipe-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeListComponent {
  readonly columns = new ColumnState([
    { field: 'code', header: 'Code' },
    { field: 'libelle', header: 'Libellé' }
  ]);

  private readonly equipeService = inject(EquipeService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('EQUIPE_WRITE'));
  protected readonly canDelete = computed(() => this.authService.hasPermission('EQUIPE_DELETE'));

  protected readonly equipes = signal<Equipe[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);

  protected readonly filterForm = this.fb.group({
    code: [''],
    libelle: ['']
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'code,asc';

  constructor() {
    this.filterForm.valueChanges
      .pipe(
        debounceTime(DEBOUNCE_RECHERCHE_MS),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed(inject(DestroyRef))
      )
      .subscribe(() => this.onSearch());
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

  protected onResetFilters(): void {
    this.filterForm.reset(undefined, { emitEvent: false });
    this.onSearch();
  }

  protected onView(equipe: Equipe): void {
    this.router.navigate(['/equipes', equipe.id]);
  }

  protected onEdit(equipe: Equipe): void {
    this.router.navigate(['/equipes', equipe.id, 'edit']);
  }

  protected onDelete(equipe: Equipe): void {
    this.confirmationService.confirm({
      header: 'Supprimer cette équipe',
      message: `Confirmez-vous la suppression de ${equipe.code} ?`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteEquipe(equipe)
    });
  }

  private deleteEquipe(equipe: Equipe): void {
    this.deletingId.set(equipe.id);
    this.equipeService
      .delete(equipe.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Équipe supprimée', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);
    const criteria = this.filterForm.getRawValue();

    this.equipeService
      .search(
        {
          code: criteria.code || undefined,
          libelle: criteria.libelle || undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.equipes.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
