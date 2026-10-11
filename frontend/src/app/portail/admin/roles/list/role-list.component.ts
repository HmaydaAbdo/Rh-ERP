import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { ColumnChooserComponent } from '../../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../../shared/feedback/feedback.service';
import { surChangementDesFiltres } from '../../../../shared/forms/filtres';
import { ColumnState } from '../../../../shared/table/table-columns';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../../shared/ui/table/table.component';
import { Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';

const DEBOUNCE_FILTRE_MS = 300;

const filtresVides = () => ({ nom: '', description: '' });

@Component({
  selector: 'app-role-list',
  imports: [ColumnChooserComponent, FormField, FormRoot, RouterLink, ButtonComponent, BadgeComponent, TableComponent, TableCellDirective, TableRowActionsDirective],
  templateUrl: './role-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleListComponent {
  private readonly roleService = inject(RoleService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly roles = signal<Role[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);
  protected readonly first = signal(0);

  protected readonly columns = new ColumnState([
    { field: 'nom', header: 'Nom' },
    { field: 'description', header: 'Description' },
    { field: 'permissions', header: 'Permissions', sortable: false }
  ]);

  /** Filtres envoyés au serveur (recherche paginée) : la saisie texte est retardée par la règle `debounce` du formulaire. */
  protected readonly filtres = signal(filtresVides());
  protected readonly filterForm = form(this.filtres, (chemin) => {
    debounce(chemin.nom, DEBOUNCE_FILTRE_MS);
    debounce(chemin.description, DEBOUNCE_FILTRE_MS);
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'nom,asc';

  constructor() {
    surChangementDesFiltres(this.filtres, () => this.onSearch());
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    this.first.set(event.first);
    const size = event.rows;
    this.lastPage = size > 0 ? Math.floor(event.first / size) : 0;
    this.lastSize = size;
    this.lastSort = event.sortField ? `${event.sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.fetchPage();
  }

  protected onSearch(): void {
    this.first.set(0);
    this.lastPage = 0;
    this.fetchPage();
  }

  protected onResetFilters(): void {
    this.filterForm().reset(filtresVides());
  }

  protected onEdit(role: Role): void {
    this.router.navigate(['/admin/roles', role.id, 'edit']);
  }

  protected onDelete(role: Role): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce rôle',
      message: `Confirmez-vous la suppression du rôle ${role.nom} ? Un rôle encore attribué à des comptes ne peut pas être supprimé : retirez-le d’abord de ces comptes.`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteRole(role)
    });
  }

  private deleteRole(role: Role): void {
    this.deletingId.set(role.id);
    this.roleService
      .delete(role.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Rôle supprimé', life: 4000 });
        this.fetchPage();
      });
  }

  private fetchPage(): void {
    this.loading.set(true);
    const { nom, description } = this.filtres();

    this.roleService
      .search({ nom: nom || undefined, description: description || undefined }, { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.roles.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
