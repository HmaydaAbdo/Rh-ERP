import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';

const ACTIF_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Actif', value: true },
  { label: 'Inactif', value: false }
];

@Component({
  selector: 'app-chantier-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    TagModule,
    ConfirmDialogModule
  ],
  providers: [ConfirmationService],
  templateUrl: './chantier-list.component.html',
  styleUrl: './chantier-list.component.scss'
})
export class ChantierListComponent {
  private readonly chantierService = inject(ChantierService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

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
    this.filterForm.reset();
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
      icon: 'pi pi-exclamation-triangle',
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
          detail: `${result.crees} créé(s), ${result.misAJour} mis à jour, ${result.ignores} ignoré(s)`,
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
        this.totalRecords = result.totalElements;
      });
  }
}
