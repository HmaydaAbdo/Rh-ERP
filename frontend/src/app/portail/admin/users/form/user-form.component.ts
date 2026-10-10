import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, forkJoin, switchMap } from 'rxjs';

import { LazySelectComponent } from '../../../../shared/components/lazy-select/lazy-select.component';
import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../../shared/forms/focus-first-error';
import { EmployeeReferenceService } from '../../../../shared/reference-data/employee-reference.service';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PasswordInputComponent } from '../../../../shared/ui/password-input/password-input.component';
import { SelectComponent, SelectOption } from '../../../../shared/ui/select/select.component';
import { motDePasseConforme, REGLE_MOT_DE_PASSE } from '../../../../shared/validators/mot-de-passe.validator';
import { PermissionSummary, Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule, RouterLink, LazySelectComponent, IconComponent, ButtonComponent, PasswordInputComponent, SelectComponent],
  templateUrl: './user-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './user-form.component.scss'
})
export class UserFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly roleService = inject(RoleService);
  protected readonly employeeReferenceService = inject(EmployeeReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly userId = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.userId() !== null);
  protected readonly saving = signal(false);
  protected readonly loading = signal(true);
  private readonly allRoles = signal<Role[]>([]);
  protected readonly roleOptions = computed<SelectOption<number>[]>(() => this.allRoles().map((role) => ({ label: role.nom, value: role.id })));

  protected readonly regleMotDePasse = REGLE_MOT_DE_PASSE;
  /** Permissions déniables = union des permissions des rôles actuellement sélectionnés. */
  protected readonly deniablePermissions = signal<PermissionSummary[]>([]);
  private readonly deniedPermissionIds = signal(new Set<number>());

  protected readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email]],
    motDePasse: [''],
    actif: [true],
    employeeId: [null as number | null],
    roleIds: [[] as number[]]
  });

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.userId.set(idParam ? Number(idParam) : null);

    this.form.controls.roleIds.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((roleIds) => this.recomputeDeniablePermissions(roleIds ?? []));

    const roles$ = this.roleService.findAll();
    const id = this.userId();

    if (id === null) {
      this.form.controls.motDePasse.addValidators([Validators.required, motDePasseConforme]);
      roles$.pipe(finalize(() => this.loading.set(false))).subscribe((roles) => this.allRoles.set(roles));
    } else {
      // Le username n'est pas modifiable après création (UserUpdateRequestDto ne le porte pas).
      this.form.controls.username.disable();
      forkJoin([roles$, this.userService.findById(id)])
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe(([roles, user]) => {
          this.allRoles.set(roles);
          this.deniedPermissionIds.set(new Set(user.permissionsRefusees.map((p) => p.id)));
          this.form.patchValue({
            username: user.username,
            email: user.email,
            actif: user.actif,
            employeeId: user.employee?.id ?? null,
            roleIds: user.roles.map((r) => r.id)
          });
        });
    }
  }

  protected isDenied(permission: PermissionSummary): boolean {
    return this.deniedPermissionIds().has(permission.id);
  }

  protected onToggleDenied(permission: PermissionSummary, event: Event): void {
    const denied = (event.target as HTMLInputElement).checked;
    this.form.markAsDirty();
    this.deniedPermissionIds.update((current) => {
      const next = new Set(current);
      if (denied) {
        next.add(permission.id);
      } else {
        next.delete(permission.id);
      }
      return next;
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focaliserPremiereErreur();
      return;
    }

    const raw = this.form.getRawValue();
    const id = this.userId();
    this.saving.set(true);

    if (id !== null) {
      this.userService
        .update(id, {
          email: raw.email!,
          actif: raw.actif!,
          employeeId: raw.employeeId,
          roleIds: raw.roleIds!
        })
        .pipe(
          switchMap(() => this.userService.updateDeniedPermissions(id, { permissionIds: Array.from(this.deniedPermissionIds()) })),
          finalize(() => this.saving.set(false))
        )
        .subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Utilisateur modifié', life: 4000 });
          this.form.markAsPristine();
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
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Utilisateur créé', life: 4000 });
          this.form.markAsPristine();
          this.router.navigate(['/admin/users']);
        });
    }
  }

  private recomputeDeniablePermissions(roleIds: number[]): void {
    const roleIdSet = new Set(roleIds);
    const parCode = new Map<string, PermissionSummary>();
    for (const role of this.allRoles()) {
      if (!roleIdSet.has(role.id)) {
        continue;
      }
      for (const permission of role.permissions) {
        parCode.set(permission.code, permission);
      }
    }
    const deniables = Array.from(parCode.values()).sort((a, b) => a.code.localeCompare(b.code));
    this.deniablePermissions.set(deniables);

    const validIds = new Set(deniables.map((p) => p.id));
    this.deniedPermissionIds.update((current) => new Set(Array.from(current).filter((id) => validIds.has(id))));
  }
}
