import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogService, NotificationService } from '@shared/feedback/feedback.service';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../shared/table/table-columns';

const ACTIF_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Actif', value: true },
  { label: 'Inactif', value: false }
];

const DEBOUNCE_RECHERCHE_MS = 300;

@Component({
    selector: 'app-chantier-list',
    imports: [
        CommonModule,
        ColumnChooserComponent,
        ReactiveFormsModule,
        RouterLink,
        TableModule,
        ButtonModule,
        InputTextModule,
        DropdownModule,
        TagModule,
    ],
    templateUrl: './chantier-list.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './chantier-list.component.scss'
})
export class ChantierListComponent implements OnInit {
  readonly columns = new ColumnState([
    { field: 'code', header: 'Code' },
    { field: 'nom', header: 'Nom' },
    { field: 'designation', header: 'Désignation', cellClass: 'chantier-list__designation' },
    { field: 'sourceErp', header: 'Source' },
    { field: 'actif', header: 'Statut' }
  ]);
  readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
  readonly pageReport = TABLE_PAGE_REPORT;

  private readonly chantierService = inject(ChantierService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  canWrite(): boolean {
    return this.authService.hasPermission('CHANTIER_WRITE');
  }

  canSync(): boolean {
    return this.authService.hasPermission('CHANTIER_SYNC');
  }

  canDelete(): boolean {
    return this.authService.hasPermission('CHANTIER_DELETE');
  }

  chantiers: Chantier[] = [];
  totalRecords = 0;
  loading = false;
  deletingId: number | null = null;
  syncing = false;

  readonly actifOptions = ACTIF_OPTIONS;

  readonly filterForm = this.fb.group({
    code: [''],
    designation: [''],
    actif: [null as boolean | null]
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'code,asc';

  ngOnInit(): void {
    this.filterForm.valueChanges
      .pipe(
        debounceTime(DEBOUNCE_RECHERCHE_MS),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      )
      .subscribe(() => this.onSearch());
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.lastSize;
    const page = size > 0 ? Math.floor((event.first ?? 0) / size) : 0;
    const sortField = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    const sort = sortField ? `${sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.lastPage = page;
    this.lastSize = size;
    this.lastSort = sort;

    this.fetchPage();
  }

  onSearch(): void {
    this.lastPage = 0;
    this.fetchPage();
  }

  onResetFilters(): void {
    this.filterForm.reset(undefined, { emitEvent: false });
    this.onSearch();
  }

  onView(chantier: Chantier): void {
    this.router.navigate(['/chantiers', chantier.id]);
  }

  onEdit(chantier: Chantier): void {
    this.router.navigate(['/chantiers', chantier.id, 'edit']);
  }

  onDelete(chantier: Chantier): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce chantier',
      message: `Confirmez-vous la suppression de ${chantier.code} ?`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteChantier(chantier)
    });
  }

  onSynchroniser(): void {
    this.syncing = true;
    this.chantierService
      .synchroniser()
      .pipe(finalize(() => (this.syncing = false)))
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
    this.deletingId = chantier.id;
    this.chantierService
      .delete(chantier.id)
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Chantier supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading = true;
    const criteria = this.filterForm.getRawValue();

    this.chantierService
      .search(
        {
          code: criteria.code || undefined,
          designation: criteria.designation || undefined,
          actif: criteria.actif ?? undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((result) => {
        this.chantiers = result.content;
        this.totalRecords = result.page.totalElements;
      });
  }
}
