import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { distinctUntilChanged, finalize, map, skip, Subscription } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { CollectionTableComponent, CollectionTableConfig } from '../../../shared/components/collection-table/collection-table.component';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { TableCellDirective, TableLazyLoadEvent, TableRowActionsDirective } from '../../../shared/ui/table/table.component';
import { EmployeeFiltres, lireFiltres, memesFiltres, versCriteres } from '../filtres/employee-filtres';
import { Employee } from '../models/employee.model';
import { libelleStatutEmploye } from '../models/employee-statut';
import { EmployeeService } from '../services/employee.service';

const CONFIGURATION_TABLE_EMPLOYE: CollectionTableConfig = {
  countLabel: (total) => `${total} employé${total > 1 ? 's' : ''}`,
  accessibleLabel: 'Liste : Employés',
  emptyMessage: 'Aucun employé ne correspond à ces critères.'
};

/** Vue Tabulaire des employés : le tableau standard, filtré par la barre commune de la coque (voir `EmployeeVuesComponent`). */
@Component({
  selector: 'app-employee-list',
  imports: [CollectionTableComponent, ButtonComponent, BadgeComponent, TableCellDirective, TableRowActionsDirective, DatePipe, DecimalPipe],
  templateUrl: './employee-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    // Unité du salaire (« / mois », « / jour ») : discrète à côté du montant
    .employee-list__unite {
      color: var(--color-text-muted);
      font-size: var(--text-xs);
    }
  `
})
export class EmployeeListComponent {
  protected readonly tableConfiguration = CONFIGURATION_TABLE_EMPLOYE;
  protected readonly libelleStatut = libelleStatutEmploye;
  private readonly authService = inject(AuthService);

  /** Le salaire est une donnée de paie : sa colonne n'existe que pour qui a `PAIE_READ` (le serveur ne l'envoie qu'à lui). */
  protected readonly columns = new ColumnState([
    { field: 'nomPrenom', header: 'Nom & prénom' },
    { field: 'cin', header: 'CIN' },
    { field: 'fonction', header: 'Fonction', sortField: 'fonction.libelle' },
    { field: 'chantier', header: 'Chantier', sortField: 'chantier.code' },
    { field: 'equipe', header: 'Équipe', sortField: 'equipe.libelle' },
    ...(this.authService.hasPermission('PAIE_READ') ? [{ field: 'salaire', header: 'Salaire', align: 'text-right' }] : []),
    { field: 'dateEmbauche', header: "Date d'embauche" },
    { field: 'statut', header: 'Statut' }
  ]);

  private readonly employeeService = inject(EmployeeService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly canWrite = computed(() => this.authService.hasPermission('EMPLOYEE_WRITE'));

  protected readonly canDelete = computed(() => this.authService.hasPermission('EMPLOYEE_DELETE'));

  protected readonly employees = signal<Employee[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly deletingId = signal<number | null>(null);

  /** Filtres de la barre commune, lus dans l'URL (voir `filtres/employee-filtres.ts`). */
  private filtres: EmployeeFiltres = lireFiltres(this.route.snapshot.queryParamMap);

  /** Première ligne de la page affichée, liée au tableau pour qu'un changement de filtres le ramène à la première page. */
  protected readonly first = signal(0);

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'nomPrenom,asc';
  private requete?: Subscription;

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
      message: `Confirmez-vous la suppression de ${employee.nomPrenom} ? Un employé qui a des bulletins de paie ou un compte utilisateur ne peut pas être supprimé : passez-le « Sorti » pour conserver son historique.`,
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

  protected fetchPage(): void {
    this.requete?.unsubscribe();
    this.loading.set(true);
    this.erreur.set(null);

    this.requete = this.employeeService
      .search(versCriteres(this.filtres), { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: (result) => {
          this.employees.set(result.content);
          this.totalRecords.set(result.page.totalElements);
        },
        error: () => this.erreur.set('Impossible de charger les employés. Vérifiez la connexion puis réessayez.')
      });
  }
}
