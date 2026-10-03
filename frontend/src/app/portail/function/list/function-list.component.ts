import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { Function, FunctionImportResult } from '../models/function.model';
import { FunctionService } from '../services/function.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../shared/table/table-columns';

const DEBOUNCE_RECHERCHE_MS = 300;

@Component({
  selector: 'app-function-list',
  standalone: true,
  imports: [
    CommonModule,
    ColumnChooserComponent,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    InputTextModule,
    ConfirmDialogModule,
    DialogModule
  ],
  providers: [ConfirmationService],
  templateUrl: './function-list.component.html',
  styleUrl: './function-list.component.scss'
})
export class FunctionListComponent implements OnInit {
  readonly columns = new ColumnState([
    { field: 'libelle', header: 'Libellé' }
  ]);
  readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
  readonly pageReport = TABLE_PAGE_REPORT;

  private readonly functionService = inject(FunctionService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  canDelete(): boolean {
    return this.authService.hasPermission('FUNCTION_DELETE');
  }

  functions: Function[] = [];
  totalRecords = 0;
  loading = false;
  deletingId: number | null = null;
  importing = false;
  importResult: FunctionImportResult | null = null;
  showImportResultDialog = false;
  downloadingTemplate = false;

  readonly filterForm = this.fb.group({
    libelle: ['']
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'libelle,asc';

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

  onView(fonction: Function): void {
    this.router.navigate(['/functions', fonction.id]);
  }

  onEdit(fonction: Function): void {
    this.router.navigate(['/functions', fonction.id, 'edit']);
  }

  onDelete(fonction: Function): void {
    this.confirmationService.confirm({
      header: 'Supprimer cette fonction',
      message: `Confirmez-vous la suppression de ${fonction.libelle} ?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteFunction(fonction)
    });
  }

  onTriggerImport(): void {
    this.fileInput.nativeElement.click();
  }

  onDownloadTemplate(): void {
    this.downloadingTemplate = true;
    this.functionService
      .telechargerModele()
      .pipe(finalize(() => (this.downloadingTemplate = false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Import_Fonctions.xlsx';
        lien.click();
        window.URL.revokeObjectURL(url);
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.importing = true;
    this.functionService
      .importer(file)
      .pipe(finalize(() => (this.importing = false)))
      .subscribe({
        next: (result) => {
          this.importResult = result;
          this.showImportResultDialog = true;
          this.messageService.add({
            severity: 'success',
            summary: 'Import terminé',
            detail: `${result.crees} créée(s) sur ${result.totalLignes} ligne(s)`,
            life: 6000
          });
          this.fetchPage();
        },
        error: (err: HttpErrorResponse) => {
          const result = err.error as FunctionImportResult | null;
          if (result && Array.isArray(result.lignesIgnorees)) {
            this.importResult = result;
            this.showImportResultDialog = true;
          }
        }
      });
  }

  private deleteFunction(fonction: Function): void {
    this.deletingId = fonction.id;
    this.functionService
      .delete(fonction.id)
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Fonction supprimée', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading = true;
    const criteria = this.filterForm.getRawValue();

    this.functionService
      .search(
        {
          libelle: criteria.libelle || undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((result) => {
        this.functions = result.content;
        this.totalRecords = result.totalElements;
      });
  }
}
