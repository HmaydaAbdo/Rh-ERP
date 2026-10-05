import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService, MenuItem } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { SplitButtonModule } from 'primeng/splitbutton';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { Employee, EmployeeImportResult, EmployeeStatut } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../shared/table/table-columns';

const STATUT_OPTIONS: { label: string; value: EmployeeStatut }[] = [
  { label: 'Actif', value: 'ACTIF' },
  { label: 'Inactif', value: 'INACTIF' }
];

const DEBOUNCE_RECHERCHE_MS = 300;

@Component({
  selector: 'app-employee-list',
  standalone: true,
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
    ConfirmDialogModule,
    DialogModule,
    SplitButtonModule,
    LazySelectComponent
  ],
  providers: [ConfirmationService],
  templateUrl: './employee-list.component.html',
  styleUrl: './employee-list.component.scss'
})
export class EmployeeListComponent implements OnInit {
  readonly columns = new ColumnState([
    { field: 'nomPrenom', header: 'Nom & prénom' },
    { field: 'cin', header: 'CIN' },
    { field: 'fonction', header: 'Fonction', sortField: 'fonction.libelle' },
    { field: 'chantier', header: 'Chantier', sortField: 'chantier.code' },
    { field: 'dateEmbauche', header: "Date d'embauche" },
    { field: 'statut', header: 'Statut' }
  ]);
  readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
  readonly pageReport = TABLE_PAGE_REPORT;

  private readonly employeeService = inject(EmployeeService);
  readonly functionReferenceService = inject(FunctionReferenceService);
  readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  canWrite(): boolean {
    return this.authService.hasPermission('EMPLOYEE_WRITE');
  }

  canImport(): boolean {
    return this.authService.hasPermission('EMPLOYEE_IMPORT');
  }

  canDelete(): boolean {
    return this.authService.hasPermission('EMPLOYEE_DELETE');
  }

  employees: Employee[] = [];
  totalRecords = 0;
  loading = false;
  deletingId: number | null = null;
  importing = false;
  importResult: EmployeeImportResult | null = null;
  showImportResultDialog = false;
  downloadingTemplate = false;

  /** Le modèle Excel se télécharge depuis le menu du bouton « Importer » : c'est le fichier qu'il attend. */
  readonly menuImport: MenuItem[] = [
    {
      label: 'Télécharger le modèle Excel',
      icon: 'pi pi-file-excel',
      command: () => {
        if (!this.downloadingTemplate) {
          this.onDownloadTemplate();
        }
      }
    }
  ];

  readonly statutOptions = STATUT_OPTIONS;

  readonly filterForm = this.fb.group({
    nomPrenom: [''],
    cin: [''],
    fonctionIds: [[] as number[]],
    chantierIds: [[] as number[]],
    statut: [null as EmployeeStatut | null]
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'nomPrenom,asc';

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

  onView(employee: Employee): void {
    this.router.navigate(['/employees', employee.id]);
  }

  onEdit(employee: Employee): void {
    this.router.navigate(['/employees', employee.id, 'edit']);
  }

  onDelete(employee: Employee): void {
    this.confirmationService.confirm({
      header: 'Supprimer cet employé',
      message: `Confirmez-vous la suppression de ${employee.nomPrenom} ? Un employé qui a des bulletins de paie ou un compte utilisateur ne peut pas être supprimé : passez-le à INACTIF pour conserver son historique.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteEmployee(employee)
    });
  }

  onTriggerImport(): void {
    this.fileInput.nativeElement.click();
  }

  onDownloadTemplate(): void {
    this.downloadingTemplate = true;
    this.employeeService
      .telechargerModele()
      .pipe(finalize(() => (this.downloadingTemplate = false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Import_Employes.xlsx';
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
    this.employeeService
      .importer(file)
      .pipe(finalize(() => (this.importing = false)))
      .subscribe({
        next: (result) => {
          this.importResult = result;
          this.showImportResultDialog = true;
          this.messageService.add({
            severity: 'success',
            summary: 'Import terminé',
            detail: `${result.crees} créé(s) sur ${result.totalLignes} ligne(s)`,
            life: 6000
          });
          this.fetchPage();
        },
        error: (err: HttpErrorResponse) => {
          const result = err.error as EmployeeImportResult | null;
          if (result && Array.isArray(result.lignesIgnorees)) {
            this.importResult = result;
            this.showImportResultDialog = true;
          }
        }
      });
  }

  private deleteEmployee(employee: Employee): void {
    this.deletingId = employee.id;
    this.employeeService
      .delete(employee.id)
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Employé supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading = true;
    const criteria = this.filterForm.getRawValue();

    this.employeeService
      .search(
        {
          nomPrenom: criteria.nomPrenom || undefined,
          cin: criteria.cin || undefined,
          fonctionIds: criteria.fonctionIds?.length ? criteria.fonctionIds : undefined,
          chantierIds: criteria.chantierIds?.length ? criteria.chantierIds : undefined,
          statut: criteria.statut ?? undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((result) => {
        this.employees = result.content;
        this.totalRecords = result.page.totalElements;
      });
  }
}
