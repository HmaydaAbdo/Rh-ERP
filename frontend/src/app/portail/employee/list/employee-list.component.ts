import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReference } from '../../../shared/reference-data/function-reference.model';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { Employee, EmployeeImportResult, EmployeeStatut } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';

const STATUT_OPTIONS: { label: string; value: EmployeeStatut }[] = [
  { label: 'Actif', value: 'ACTIF' },
  { label: 'Inactif', value: 'INACTIF' }
];

@Component({
  selector: 'app-employee-list',
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
    ConfirmDialogModule,
    DialogModule
  ],
  providers: [ConfirmationService],
  templateUrl: './employee-list.component.html',
  styleUrl: './employee-list.component.scss'
})
export class EmployeeListComponent implements OnInit {
  private readonly employeeService = inject(EmployeeService);
  private readonly functionReferenceService = inject(FunctionReferenceService);
  private readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

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

  functions: FunctionReference[] = [];
  chantiers: ChantierReference[] = [];
  readonly statutOptions = STATUT_OPTIONS;

  readonly filterForm = this.fb.group({
    nomPrenom: [''],
    cin: [''],
    fonctionId: [null as number | null],
    chantierId: [null as number | null],
    statut: [null as EmployeeStatut | null]
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'nomPrenom,asc';

  ngOnInit(): void {
    this.functionReferenceService.list().subscribe((functions) => (this.functions = functions));
    this.chantierReferenceService.listActive().subscribe((chantiers) => (this.chantiers = chantiers));
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
    this.filterForm.reset();
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
      message: `Confirmez-vous la suppression de ${employee.nomPrenom} ?`,
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
            detail: `${result.crees} créé(s), ${result.misAJour} mis à jour sur ${result.totalLignes} ligne(s)`,
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
          fonctionId: criteria.fonctionId ?? undefined,
          chantierId: criteria.chantierId ?? undefined,
          statut: criteria.statut ?? undefined
        },
        { page: this.lastPage, size: this.lastSize, sort: this.lastSort }
      )
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((result) => {
        this.employees = result.content;
        this.totalRecords = result.totalElements;
      });
  }
}
