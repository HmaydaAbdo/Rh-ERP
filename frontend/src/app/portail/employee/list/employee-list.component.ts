import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { DatePipe } from '@angular/common';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { surChangementDesFiltres } from '../../../shared/forms/filtres';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { MenuAction } from '../../../shared/ui/menu/menu-button.component';
import { SplitButtonComponent } from '../../../shared/ui/menu/split-button.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { Employee, EmployeeImportResult, EmployeeStatut } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';

const STATUT_OPTIONS: { label: string; value: EmployeeStatut }[] = [
  { label: 'Actif', value: 'ACTIF' },
  { label: 'Inactif', value: 'INACTIF' }
];

const DEBOUNCE_RECHERCHE_MS = 300;

const filtresVides = () => ({
  nomPrenom: '',
  cin: '',
  fonctionIds: [] as number[],
  chantierIds: [] as number[],
  statut: null as EmployeeStatut | null
});

@Component({
  selector: 'app-employee-list',
  imports: [
    ColumnChooserComponent,
    RouterLink,
    LazySelectComponent,
    ButtonComponent,
    BadgeComponent,
    SelectComponent,
    DialogComponent,
    SplitButtonComponent,
    TableComponent,
    TableCellDirective,
    TableRowActionsDirective,
    DatePipe,
    FormField,
    FormRoot
  ],
  templateUrl: './employee-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './employee-list.component.scss'
})
export class EmployeeListComponent {
  protected readonly columns = new ColumnState([
    { field: 'nomPrenom', header: 'Nom & prénom' },
    { field: 'cin', header: 'CIN' },
    { field: 'fonction', header: 'Fonction', sortField: 'fonction.libelle' },
    { field: 'chantier', header: 'Chantier', sortField: 'chantier.code' },
    { field: 'dateEmbauche', header: "Date d'embauche" },
    { field: 'statut', header: 'Statut' }
  ]);

  private readonly employeeService = inject(EmployeeService);
  protected readonly functionReferenceService = inject(FunctionReferenceService);
  protected readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly canWrite = computed(() => this.authService.hasPermission('EMPLOYEE_WRITE'));

  protected readonly canImport = computed(() => this.authService.hasPermission('EMPLOYEE_IMPORT'));

  protected readonly canDelete = computed(() => this.authService.hasPermission('EMPLOYEE_DELETE'));

  protected readonly employees = signal<Employee[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);
  protected readonly importing = signal(false);
  protected readonly importResult = signal<EmployeeImportResult | null>(null);
  protected readonly showImportResultDialog = signal(false);
  protected readonly downloadingTemplate = signal(false);

  /** Le modèle Excel se télécharge depuis le menu du bouton « Importer » : c'est le fichier qu'il attend. */
  protected readonly menuImport: MenuAction[] = [
    {
      label: 'Télécharger le modèle Excel',
      icon: 'file-spreadsheet',
      command: () => {
        if (!this.downloadingTemplate()) {
          this.onDownloadTemplate();
        }
      }
    }
  ];

  protected readonly statutOptions = STATUT_OPTIONS;

  protected readonly filtres = signal(filtresVides());
  protected readonly filterForm = form(this.filtres, (chemin) => {
    debounce(chemin.nomPrenom, DEBOUNCE_RECHERCHE_MS);
    debounce(chemin.cin, DEBOUNCE_RECHERCHE_MS);
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'nomPrenom,asc';

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

  protected onView(employee: Employee): void {
    this.router.navigate(['/employees', employee.id]);
  }

  protected onEdit(employee: Employee): void {
    this.router.navigate(['/employees', employee.id, 'edit']);
  }

  protected onDelete(employee: Employee): void {
    this.confirmationService.confirm({
      header: 'Supprimer cet employé',
      message: `Confirmez-vous la suppression de ${employee.nomPrenom} ? Un employé qui a des bulletins de paie ou un compte utilisateur ne peut pas être supprimé : passez-le à INACTIF pour conserver son historique.`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteEmployee(employee)
    });
  }

  protected onTriggerImport(): void {
    this.fileInput().nativeElement.click();
  }

  protected onDownloadTemplate(): void {
    this.downloadingTemplate.set(true);
    this.employeeService
      .telechargerModele()
      .pipe(finalize(() => this.downloadingTemplate.set(false)))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'Modele_Import_Employes.xlsx';
        lien.click();
        window.URL.revokeObjectURL(url);
      });
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.importing.set(true);
    this.employeeService
      .importer(file)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        next: (result) => {
          this.importResult.set(result);
          this.showImportResultDialog.set(true);
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
            this.importResult.set(result);
            this.showImportResultDialog.set(true);
          }
        }
      });
  }

  private deleteEmployee(employee: Employee): void {
    this.deletingId.set(employee.id);
    this.employeeService
      .delete(employee.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Employé supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);
    const criteria = this.filtres();

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
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.employees.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
