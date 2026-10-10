import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { surChangementDesFiltres } from '../../../shared/forms/filtres';
import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';

const ACTIF_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Actif', value: true },
  { label: 'Inactif', value: false }
];

const DEBOUNCE_RECHERCHE_MS = 300;

const filtresVides = () => ({ code: '', designation: '', actif: null as boolean | null });

@Component({
  selector: 'app-chantier-list',
  imports: [
    ColumnChooserComponent,
    RouterLink,
    ButtonComponent,
    BadgeComponent,
    SelectComponent,
    TableComponent,
    TableCellDirective,
    TableRowActionsDirective,
    FormField,
    FormRoot
  ],
  templateUrl: './chantier-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierListComponent {
  protected readonly columns = new ColumnState([
    { field: 'code', header: 'Code' },
    { field: 'nom', header: 'Nom' },
    { field: 'designation', header: 'Désignation', cellClass: 'text-truncate' },
    { field: 'sourceErp', header: 'Source' },
    { field: 'actif', header: 'Statut' }
  ]);

  private readonly chantierService = inject(ChantierService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('CHANTIER_WRITE'));

  protected readonly canSync = computed(() => this.authService.hasPermission('CHANTIER_SYNC'));

  protected readonly canDelete = computed(() => this.authService.hasPermission('CHANTIER_DELETE'));

  protected readonly chantiers = signal<Chantier[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);
  protected readonly syncing = signal(false);

  protected readonly actifOptions = ACTIF_OPTIONS;

  protected readonly filtres = signal(filtresVides());
  protected readonly filterForm = form(this.filtres, (chemin) => {
    debounce(chemin.code, DEBOUNCE_RECHERCHE_MS);
    debounce(chemin.designation, DEBOUNCE_RECHERCHE_MS);
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'code,asc';

  constructor() {
    surChangementDesFiltres(this.filtres, () => this.onSearch());
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
    this.filterForm().reset(filtresVides());
  }

  protected onView(chantier: Chantier): void {
    this.router.navigate(['/chantiers', chantier.id]);
  }

  protected onEdit(chantier: Chantier): void {
    this.router.navigate(['/chantiers', chantier.id, 'edit']);
  }

  protected onDelete(chantier: Chantier): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce chantier',
      message: `Confirmez-vous la suppression de ${chantier.code} ?`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteChantier(chantier)
    });
  }

  protected onSynchroniser(): void {
    this.syncing.set(true);
    this.chantierService
      .synchroniser()
      .pipe(finalize(() => this.syncing.set(false)))
      .subscribe((result) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Synchronisation terminée',
          detail: `${result.crees} créé(s), ${result.dejaPresents} déjà présent(s), ${result.ignores} ignoré(s)`,
          life: 8000
        });
        this.fetchPage();
      });
  }

  private deleteChantier(chantier: Chantier): void {
    this.deletingId.set(chantier.id);
    this.chantierService
      .delete(chantier.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Chantier supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);
    const criteria = this.filtres();

    this.chantierService
      .search(
        {
          code: criteria.code || undefined,
          designation: criteria.designation || undefined,
          actif: criteria.actif ?? undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.chantiers.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
