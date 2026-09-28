import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CalendarModule } from 'primeng/calendar';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { PaieExportDialogComponent } from '../export/paie-export-dialog.component';
import { Paie, PaieImportResult } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

const DEBOUNCE_RECHERCHE_MS = 300;

function toPeriodeString(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-paie-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    CalendarModule,
    ConfirmDialogModule,
    DialogModule,
    PaieExportDialogComponent,
    LazySelectComponent
  ],
  providers: [ConfirmationService],
  templateUrl: './paie-list.component.html',
  styleUrl: './paie-list.component.scss'
})
export class PaieListComponent implements OnInit {
  private readonly paieService = inject(PaieService);
  readonly functionReferenceService = inject(FunctionReferenceService);
  readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  canDelete(): boolean {
    return this.authService.hasPermission('PAIE_DELETE');
  }

  paies: Paie[] = [];
  totalRecords = 0;
  loading = false;
  deletingId: number | null = null;

  readonly filterForm = this.fb.group({
    nomPrenom: [''],
    cin: [''],
    periode: [null as Date | null],
    fonctionIds: [[] as number[]],
    chantierIds: [[] as number[]]
  });

  showImportDialog = false;
  importing = false;
  importResult: PaieImportResult | null = null;
  showImportResultDialog = false;
  downloadingTemplate = false;

  readonly importForm = this.fb.group({
    periode: [null as Date | null]
  });

  showExportDialog = false;

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'periode,desc';

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

  onView(paie: Paie): void {
    this.router.navigate(['/paie', paie.id]);
  }

  onEdit(paie: Paie): void {
    this.router.navigate(['/paie', paie.id, 'edit']);
  }

  onDelete(paie: Paie): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce bulletin',
      message: `Confirmez-vous la suppression du bulletin de ${paie.employee.nomPrenom} (${paie.periode}) ?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deletePaie(paie)
    });
  }

  onOpenImportDialog(): void {
    this.importForm.reset();
    this.showImportDialog = true;
  }

  onDownloadTemplate(): void {
    this.downloadingTemplate = true;
    this.paieService
      .telechargerModele()
      .pipe(finalize(() => (this.downloadingTemplate = false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Import_Paie.xlsx';
        lien.click();
        window.URL.revokeObjectURL(url);
      });
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const periode = toPeriodeString(this.importForm.controls.periode.value);
    input.value = '';
    if (!file || !periode) {
      return;
    }

    this.importing = true;
    this.paieService
      .importer(file, periode)
      .pipe(finalize(() => (this.importing = false)))
      .subscribe({
        next: (result) => {
          this.showImportDialog = false;
          this.importResult = result;
          this.showImportResultDialog = true;
          const fonctionsCreeesDetail = result.fonctionsCreees.length > 0
            ? ` — ${result.fonctionsCreees.length} fonction(s) créée(s) : ${result.fonctionsCreees.join(', ')}`
            : '';
          this.messageService.add({
            severity: 'success',
            summary: 'Import terminé',
            detail: `${result.crees} créé(s), ${result.misAJour} mis à jour sur ${result.totalLignes} ligne(s)${fonctionsCreeesDetail}`,
            life: 8000
          });
          this.fetchPage();
        },
        error: (err: HttpErrorResponse) => {
          const result = err.error as PaieImportResult | null;
          if (result && Array.isArray(result.lignesIgnorees)) {
            this.showImportDialog = false;
            this.importResult = result;
            this.showImportResultDialog = true;
          }
        }
      });
  }

  private deletePaie(paie: Paie): void {
    this.deletingId = paie.id;
    this.paieService
      .delete(paie.id)
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Bulletin supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading = true;
    const criteria = this.filterForm.getRawValue();

    this.paieService
      .search(
        {
          nomPrenom: criteria.nomPrenom || undefined,
          cin: criteria.cin || undefined,
          periode: toPeriodeString(criteria.periode),
          fonctionIds: criteria.fonctionIds?.length ? criteria.fonctionIds : undefined,
          chantierIds: criteria.chantierIds?.length ? criteria.chantierIds : undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((result) => {
        this.paies = result.content;
        this.totalRecords = result.totalElements;
      });
  }
}
