import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { disabled, form, FormField, FormRoot, maxLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';

import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../../shared/forms/soumission';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../../shared/ui/field-error/field-error.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PermissionSummary } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';

interface PermissionGroup {
  domaine: string;
  permissions: PermissionSummary[];
}

@Component({
  selector: 'app-role-form',
  imports: [FormField, FormRoot, RouterLink, IconComponent, ButtonComponent, FieldErrorComponent],
  templateUrl: './role-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './role-form.component.scss'
})
export class RoleFormComponent {
  private readonly roleService = inject(RoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly roleId = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.roleId() !== null);
  protected readonly loading = signal(true);
  protected readonly permissionGroups = signal<PermissionGroup[]>([]);
  private readonly selectedPermissionIds = signal(new Set<number>());
  /** Rôle d'administration : seule sa description se modifie, le serveur refuse le reste. */
  protected readonly protege = signal(false);

  private readonly modele = signal({ nom: '', description: '' });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      disabled(chemin.nom, () => this.protege());
      required(chemin.nom, { message: 'Le nom est obligatoire.' });
      maxLength(chemin.nom, 50, { message: 'Le nom ne dépasse pas 50 caractères.' });
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;
    this.roleId.set(id);

    const permissions$ = this.roleService.findAllPermissions();

    if (id !== null) {
      forkJoin([permissions$, this.roleService.findById(id)])
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe(([permissions, role]) => {
          this.buildGroups(permissions);
          this.selectedPermissionIds.set(new Set(role.permissions.map((p) => p.id)));
          this.modele.set({ nom: role.nom, description: role.description ?? '' });
          this.protege.set(role.protege);
        });
    } else {
      permissions$.pipe(finalize(() => this.loading.set(false))).subscribe((permissions) => this.buildGroups(permissions));
    }
  }

  protected isChecked(permission: PermissionSummary): boolean {
    return this.selectedPermissionIds().has(permission.id);
  }

  protected onToggle(permission: PermissionSummary, event: Event): void {
    this.toggle([permission], (event.target as HTMLInputElement).checked);
  }

  protected onToggleGroup(group: PermissionGroup, event: Event): void {
    this.toggle(group.permissions, (event.target as HTMLInputElement).checked);
  }

  protected isGroupFullySelected(group: PermissionGroup): boolean {
    return group.permissions.every((p) => this.selectedPermissionIds().has(p.id));
  }

  private async enregistrer(): Promise<void> {
    const saisie = this.modele();
    const dto = {
      nom: saisie.nom,
      description: saisie.description || null,
      permissionIds: Array.from(this.selectedPermissionIds())
    };
    const id = this.roleId();

    const role = await attendreEnregistrement(id !== null ? this.roleService.update(id, dto) : this.roleService.create(dto));
    if (!role) {
      return;
    }
    this.messageService.add({
      severity: 'success',
      summary: id !== null ? 'Rôle modifié' : 'Rôle créé',
      life: 4000
    });
    this.form().reset();
    this.router.navigate(['/admin/roles']);
  }

  private toggle(permissions: PermissionSummary[], checked: boolean): void {
    this.form().markAsDirty();
    if (this.protege()) {
      return;
    }
    this.selectedPermissionIds.update((current) => {
      const next = new Set(current);
      for (const permission of permissions) {
        if (checked) {
          next.add(permission.id);
        } else {
          next.delete(permission.id);
        }
      }
      return next;
    });
  }

  private buildGroups(permissions: PermissionSummary[]): void {
    const parDomaine = new Map<string, PermissionSummary[]>();
    for (const permission of permissions) {
      const domaine = permission.code.split('_')[0];
      if (!parDomaine.has(domaine)) {
        parDomaine.set(domaine, []);
      }
      parDomaine.get(domaine)!.push(permission);
    }
    this.permissionGroups.set(
      Array.from(parDomaine.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([domaine, perms]) => ({ domaine, permissions: perms }))
    );
  }
}
