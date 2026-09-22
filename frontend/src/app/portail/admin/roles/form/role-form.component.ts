import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { finalize, forkJoin } from 'rxjs';

import { PermissionSummary } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';

interface PermissionGroup {
  domaine: string;
  permissions: PermissionSummary[];
}

@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink, ButtonModule, InputTextModule, CheckboxModule],
  templateUrl: './role-form.component.html',
  styleUrl: './role-form.component.scss'
})
export class RoleFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly roleService = inject(RoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  roleId: number | null = null;
  saving = false;
  loading = true;
  permissionGroups: PermissionGroup[] = [];
  selectedPermissionIds = new Set<number>();

  readonly form = this.fb.group({
    nom: ['', [Validators.required, Validators.maxLength(50)]],
    description: ['']
  });

  get isEditMode(): boolean {
    return this.roleId !== null;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.roleId = idParam ? Number(idParam) : null;

    const permissions$ = this.roleService.findAllPermissions();

    if (this.isEditMode) {
      forkJoin([permissions$, this.roleService.findById(this.roleId!)])
        .pipe(finalize(() => (this.loading = false)))
        .subscribe(([permissions, role]) => {
          this.buildGroups(permissions);
          this.selectedPermissionIds = new Set(role.permissions.map((p) => p.id));
          this.form.patchValue({ nom: role.nom, description: role.description ?? '' });
        });
    } else {
      permissions$.pipe(finalize(() => (this.loading = false))).subscribe((permissions) => this.buildGroups(permissions));
    }
  }

  isChecked(permission: PermissionSummary): boolean {
    return this.selectedPermissionIds.has(permission.id);
  }

  toggle(permission: PermissionSummary, checked: boolean): void {
    if (checked) {
      this.selectedPermissionIds.add(permission.id);
    } else {
      this.selectedPermissionIds.delete(permission.id);
    }
  }

  toggleGroup(group: PermissionGroup, checked: boolean): void {
    for (const permission of group.permissions) {
      this.toggle(permission, checked);
    }
  }

  isGroupFullySelected(group: PermissionGroup): boolean {
    return group.permissions.every((p) => this.selectedPermissionIds.has(p.id));
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const dto = {
      nom: raw.nom!,
      description: raw.description || null,
      permissionIds: Array.from(this.selectedPermissionIds)
    };

    this.saving = true;
    const request$ = this.isEditMode ? this.roleService.update(this.roleId!, dto) : this.roleService.create(dto);

    request$
      .pipe(finalize(() => (this.saving = false)))
      .subscribe(() => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode ? 'Rôle modifié' : 'Rôle créé',
          life: 4000
        });
        this.router.navigate(['/admin/roles']);
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
    this.permissionGroups = Array.from(parDomaine.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domaine, perms]) => ({ domaine, permissions: perms }));
  }
}
