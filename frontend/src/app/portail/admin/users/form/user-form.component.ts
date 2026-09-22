import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { MultiSelectModule } from 'primeng/multiselect';
import { PasswordModule } from 'primeng/password';
import { finalize, forkJoin, switchMap } from 'rxjs';

import { PermissionSummary, Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    MultiSelectModule,
    InputSwitchModule,
    InputNumberModule,
    CheckboxModule
  ],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss'
})
export class UserFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly roleService = inject(RoleService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  userId: number | null = null;
  saving = false;
  loading = true;
  allRoles: Role[] = [];

  /** Permissions déniables = union des permissions des rôles actuellement sélectionnés. */
  deniablePermissions: PermissionSummary[] = [];
  deniedPermissionIds = new Set<number>();

  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email]],
    motDePasse: [''],
    actif: [true],
    employeeId: [null as number | null],
    roleIds: [[] as number[]]
  });

  get isEditMode(): boolean {
    return this.userId !== null;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.userId = idParam ? Number(idParam) : null;

    if (!this.isEditMode) {
      this.form.controls.motDePasse.addValidators([Validators.required, Validators.minLength(8)]);
    } else {
      // Le username n'est pas modifiable après création (UserUpdateRequestDto ne le porte pas).
      this.form.controls.username.disable();
    }

    const roles$ = this.roleService.findAll();

    if (this.isEditMode) {
      forkJoin([roles$, this.userService.findById(this.userId!)])
        .pipe(finalize(() => (this.loading = false)))
        .subscribe(([roles, user]) => {
          this.allRoles = roles;
          const roleIds = user.roles.map((r) => r.id);
          this.form.patchValue({
            username: user.username,
            email: user.email,
            actif: user.actif,
            employeeId: user.employee?.id ?? null,
            roleIds
          });
          this.deniedPermissionIds = new Set(user.permissionsRefusees.map((p) => p.id));
          this.recomputeDeniablePermissions(roleIds);
        });
    } else {
      roles$.pipe(finalize(() => (this.loading = false))).subscribe((roles) => (this.allRoles = roles));
    }
  }

  onRolesChange(roleIds: number[]): void {
    this.recomputeDeniablePermissions(roleIds);
  }

  isDenied(permission: PermissionSummary): boolean {
    return this.deniedPermissionIds.has(permission.id);
  }

  toggleDenied(permission: PermissionSummary, denied: boolean): void {
    if (denied) {
      this.deniedPermissionIds.add(permission.id);
    } else {
      this.deniedPermissionIds.delete(permission.id);
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.saving = true;

    if (this.isEditMode) {
      this.userService
        .update(this.userId!, {
          email: raw.email!,
          actif: raw.actif!,
          employeeId: raw.employeeId,
          roleIds: raw.roleIds!
        })
        .pipe(
          switchMap(() =>
            this.userService.updateDeniedPermissions(this.userId!, { permissionIds: Array.from(this.deniedPermissionIds) })
          ),
          finalize(() => (this.saving = false))
        )
        .subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Utilisateur modifié', life: 4000 });
          this.router.navigate(['/admin/users']);
        });
    } else {
      this.userService
        .create({
          username: raw.username!,
          email: raw.email!,
          motDePasse: raw.motDePasse!,
          employeeId: raw.employeeId,
          roleIds: raw.roleIds!
        })
        .pipe(finalize(() => (this.saving = false)))
        .subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Utilisateur créé', life: 4000 });
          this.router.navigate(['/admin/users']);
        });
    }
  }

  private recomputeDeniablePermissions(roleIds: number[]): void {
    const roleIdSet = new Set(roleIds);
    const parCode = new Map<string, PermissionSummary>();
    for (const role of this.allRoles) {
      if (!roleIdSet.has(role.id)) {
        continue;
      }
      for (const permission of role.permissions) {
        parCode.set(permission.code, permission);
      }
    }
    this.deniablePermissions = Array.from(parCode.values()).sort((a, b) => a.code.localeCompare(b.code));

    const validIds = new Set(this.deniablePermissions.map((p) => p.id));
    for (const id of Array.from(this.deniedPermissionIds)) {
      if (!validIds.has(id)) {
        this.deniedPermissionIds.delete(id);
      }
    }
  }
}
