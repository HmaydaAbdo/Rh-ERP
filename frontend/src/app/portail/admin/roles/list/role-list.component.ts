import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, finalize } from 'rxjs';

import { ColumnChooserComponent } from '../../../../shared/components/column-chooser/column-chooser.component';
import { ConfirmDialogService, NotificationService } from '../../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../../shared/table/table-columns';
import { contient } from '../../../../shared/text/recherche';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { TableCellDirective, TableComponent, TableRowActionsDirective } from '../../../../shared/ui/table/table.component';
import { Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';

const DEBOUNCE_FILTRE_MS = 300;

@Component({
  selector: 'app-role-list',
  imports: [ColumnChooserComponent, ReactiveFormsModule, RouterLink, ButtonComponent, BadgeComponent, TableComponent, TableCellDirective, TableRowActionsDirective],
  templateUrl: './role-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleListComponent {
  private readonly roleService = inject(RoleService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly roles = signal<Role[]>([]);
  protected readonly loading = signal(false);
  protected readonly deletingId = signal<number | null>(null);

  protected readonly columns = new ColumnState([
    { field: 'nom', header: 'Nom' },
    { field: 'description', header: 'Description' },
    { field: 'permissions', header: 'Permissions', sortField: 'permissions.length' }
  ]);

  /** Filtres en temps réel : appliqués côté client sur la liste complète déjà chargée (liste non paginée côté serveur). */
  protected readonly filterForm = this.fb.group({
    nom: [''],
    description: ['']
  });

  private readonly criteres = signal({ nom: '', description: '' });

  protected readonly filtres = computed(() => {
    const { nom, description } = this.criteres();
    return this.roles().filter((role) => contient(role.nom, nom) && contient(role.description, description));
  });

  constructor() {
    this.filterForm.valueChanges.pipe(debounceTime(DEBOUNCE_FILTRE_MS), takeUntilDestroyed(inject(DestroyRef))).subscribe((value) => {
      this.criteres.set({ nom: value.nom ?? '', description: value.description ?? '' });
    });
    this.fetch();
  }

  protected onResetFilters(): void {
    this.filterForm.reset();
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
        this.fetch();
      });
  }

  private fetch(): void {
    this.loading.set(true);
    this.roleService
      .findAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((roles) => this.roles.set(roles));
  }
}
