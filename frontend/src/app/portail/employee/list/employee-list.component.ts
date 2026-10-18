import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, finalize, map, skip } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { EmployeeFiltres, lireFiltres, memesFiltres, versCriteres } from '../filtres/employee-filtres';
import { Employee } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';

/** Vue Tabulaire des employés : le tableau standard, filtré par la barre commune de la coque (voir `EmployeeVuesComponent`). */
@Component({
  selector: 'app-employee-list',
  imports: [ColumnChooserComponent, ButtonComponent, BadgeComponent, TableComponent, TableCellDirective, TableRowActionsDirective, DatePipe],
  templateUrl: './employee-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
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
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly canWrite = computed(() => this.authService.hasPermission('EMPLOYEE_WRITE'));

  protected readonly canDelete = computed(() => this.authService.hasPermission('EMPLOYEE_DELETE'));

  protected readonly employees = signal<Employee[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);

  /** Filtres de la barre commune, lus dans l'URL (voir `filtres/employee-filtres.ts`). */
  private filtres: EmployeeFiltres = lireFiltres(this.route.snapshot.queryParamMap);

  /** Première ligne de la page affichée, liée au tableau pour qu'un changement de filtres le ramène à la première page. */
  protected readonly first = signal(0);

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'nomPrenom,asc';

  constructor() {
    // La première émission est celle de l'URL déjà lue ci-dessus : le premier chargement vient du tableau (`onLazyLoad`).
    this.route.queryParamMap
      .pipe(map(lireFiltres), skip(1), distinctUntilChanged(memesFiltres), takeUntilDestroyed(this.destroyRef))
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
    this.first.set(0);
    this.fetchPage();
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

    this.employeeService
      .search(versCriteres(this.filtres), { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.employees.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
