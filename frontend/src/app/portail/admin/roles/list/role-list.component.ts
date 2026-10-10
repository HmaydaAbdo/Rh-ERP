import { CommonModule } from '@angular/common';
import { Component, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogService, NotificationService } from '@shared/feedback/feedback.service';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { finalize } from 'rxjs';

import { Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';
import { ColumnChooserComponent } from '../../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../../shared/table/table-columns';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { debounceTime } from 'rxjs';

const DEBOUNCE_FILTRE_MS = 300;

@Component({
    selector: 'app-role-list',
    imports: [ColumnChooserComponent, ReactiveFormsModule, InputTextModule, CommonModule, RouterLink, TableModule, ButtonModule, TagModule],
    templateUrl: './role-list.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './role-list.component.scss'
})
export class RoleListComponent {
  private readonly roleService = inject(RoleService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);

  roles: Role[] = [];
  loading = false;
  deletingId: number | null = null;

  readonly columns = new ColumnState([
    { field: 'nom', header: 'Nom' },
    { field: 'description', header: 'Description' },
    { field: 'permissions', header: 'Permissions', sortField: 'permissions.length' }
  ]);
  readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
  readonly pageReport = TABLE_PAGE_REPORT;

  @ViewChild('dt') private table?: Table;

  /** Filtres en temps réel : appliqués côté client sur la liste complète déjà chargée (liste non paginée côté serveur). */
  private readonly fb = inject(FormBuilder);
  readonly filterForm = this.fb.group({
    nom: [''],
    description: ['']
  });

  constructor() {
    this.filterForm.valueChanges.pipe(debounceTime(DEBOUNCE_FILTRE_MS)).subscribe((value) => {
      this.table?.filter(value.nom ?? '', 'nom', 'contains');
      this.table?.filter(value.description ?? '', 'description', 'contains');
    });
    this.fetch();
  }

  onResetFilters(): void {
    this.filterForm.reset();
  }

  onEdit(role: Role): void {
    this.router.navigate(['/admin/roles', role.id, 'edit']);
  }

  onDelete(role: Role): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce rôle',
      message: `Confirmez-vous la suppression du rôle ${role.nom} ? Un rôle encore attribué à des comptes ne peut pas être supprimé : retirez-le d’abord de ces comptes.`,
      acceptLabel: 'Supprimer',
      rejectLabel: 'Annuler',
      accept: () => this.deleteRole(role)
    });
  }

  private deleteRole(role: Role): void {
    this.deletingId = role.id;
    this.roleService
      .delete(role.id)
      .pipe(finalize(() => (this.deletingId = null)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Rôle supprimé', life: 4000 });
        this.fetch();
      });
  }

  private fetch(): void {
    this.loading = true;
    this.roleService
      .findAll()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((roles) => (this.roles = roles));
  }

  /** Nombre de lignes affichées : la liste complète est en mémoire, le tableau la filtre côté client. */
  total(table: Table): number {
    return table.filteredValue?.length ?? this.roles.length;
  }
}
