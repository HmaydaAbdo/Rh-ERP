import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { finalize } from 'rxjs';

import { Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TableModule, ButtonModule, ConfirmDialogModule, TagModule],
  providers: [ConfirmationService],
  templateUrl: './role-list.component.html',
  styleUrl: './role-list.component.scss'
})
export class RoleListComponent {
  private readonly roleService = inject(RoleService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  roles: Role[] = [];
  loading = false;
  deletingId: number | null = null;

  constructor() {
    this.fetch();
  }

  onEdit(role: Role): void {
    this.router.navigate(['/admin/roles', role.id, 'edit']);
  }

  onDelete(role: Role): void {
    this.confirmationService.confirm({
      header: 'Supprimer ce rôle',
      message: `Confirmez-vous la suppression du rôle ${role.nom} ? Les utilisateurs qui l'ont perdront les permissions qu'il accordait.`,
      icon: 'pi pi-exclamation-triangle',
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
}
