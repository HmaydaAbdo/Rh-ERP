import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { disabled, email, form, FormField, FormRoot, maxLength, minLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';

import { LazySelectComponent } from '../../../../shared/components/lazy-select/lazy-select.component';
import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../../shared/forms/soumission';
import { EmployeeReferenceService } from '../../../../shared/reference-data/employee-reference.service';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../../shared/ui/field-error/field-error.component';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PasswordInputComponent } from '../../../../shared/ui/password-input/password-input.component';
import { motDePasseConforme } from '../../../../shared/validators/mot-de-passe.validator';
import { PermissionSummary } from '../../models/admin.model';
import { RoleReferenceService } from '../../services/role-reference.service';
import { UserService } from '../../services/user.service';

interface UserSaisie {
  username: string;
  email: string;
  motDePasse: string;
  actif: boolean;
  employeeId: number | null;
  roleIds: number[];
}

interface PermissionGroup {
  domaine: string;
  autorisees: PermissionSummary[];
  nonAutorisees: PermissionSummary[];
}

@Component({
  selector: 'app-user-form',
  imports: [FormField, FormRoot, RouterLink, LazySelectComponent, IconComponent, ButtonComponent, FieldErrorComponent, PasswordInputComponent],
  providers: [RoleReferenceService],
  templateUrl: './user-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './user-form.component.scss'
})
export class UserFormComponent {
  private readonly userService = inject(UserService);
  protected readonly employeeReferenceService = inject(EmployeeReferenceService);
  protected readonly roleReferenceService = inject(RoleReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly userId = signal<number | null>(null);
  private readonly version = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.userId() !== null);
  protected readonly loading = signal(true);

  private readonly deniedPermissionIds = signal(new Set<number>());
  private readonly permissionCatalogue = signal<PermissionSummary[]>([]);

  private readonly modele = signal<UserSaisie>({ username: '', email: '', motDePasse: '', actif: true, employeeId: null, roleIds: [] });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      // Le username n'est pas modifiable après création (UserUpdateRequestDto ne le porte pas).
      disabled(chemin.username, () => this.isEditMode());
      required(chemin.username, { message: "Le nom d'utilisateur est obligatoire." });
      minLength(chemin.username, 3, { message: '3 à 50 caractères.' });
      maxLength(chemin.username, 50, { message: '3 à 50 caractères.' });
      required(chemin.email, { message: "L'email est obligatoire." });
      email(chemin.email, { message: 'Email invalide.' });
      required(chemin.motDePasse, { when: () => !this.isEditMode(), message: 'Le mot de passe est obligatoire.' });
      motDePasseConforme(chemin.motDePasse);
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  /** Permissions déniables = union des permissions des rôles actuellement sélectionnés. */
  protected readonly deniablePermissions = computed<PermissionSummary[]>(() => {
    const roleIds = new Set(this.form.roleIds().value());
    const parCode = new Map<string, PermissionSummary>();
    for (const role of this.roleReferenceService.rolesConnus().values()) {
      if (!roleIds.has(role.id)) {
        continue;
      }
      for (const permission of role.permissions) {
        parCode.set(permission.code, permission);
      }
    }
    return Array.from(parCode.values()).sort((a, b) => a.code.localeCompare(b.code));
  });

  /** Toutes les permissions du catalogue, et pas seulement celles héritées des rôles choisis. */
  protected readonly displayedPermissions = computed<PermissionSummary[]>(() => {
    const catalogue = this.permissionCatalogue();
    return catalogue.length > 0 ? catalogue : this.deniablePermissions();
  });

  protected readonly permissionGroups = computed<PermissionGroup[]>(() => {
    const parDomaine = new Map<string, PermissionSummary[]>();
    const deniables = new Set(this.deniablePermissions().map((permission) => permission.code));
    for (const permission of this.displayedPermissions()) {
      const domaine = permission.code.split('_')[0];
      const permissions = parDomaine.get(domaine) ?? [];
      permissions.push(permission);
      parDomaine.set(domaine, permissions);
    }

    return Array.from(parDomaine.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domaine, permissions]) => ({
        domaine,
        autorisees: permissions.filter((permission) => deniables.has(permission.code) && !this.isDenied(permission)),
        nonAutorisees: permissions.filter((permission) => !deniables.has(permission.code) || this.isDenied(permission))
      }));
  });

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.userId.set(idParam ? Number(idParam) : null);

    // Retirer un rôle retire aussi les refus de ses permissions : seules les permissions encore déniables restent refusées.
    effect(() => {
      const roleIds = this.form.roleIds().value();
      const rolesConnus = this.roleReferenceService.rolesConnus();
      // En édition, attendre que le sélecteur ait résolu tous les rôles avant de purger des refus.
      if (roleIds.some((id) => !rolesConnus.has(id))) {
        return;
      }
      const deniables = new Set(this.deniablePermissions().map((permission) => permission.id));
      untracked(() => this.deniedPermissionIds.update((courant) => new Set(Array.from(courant).filter((id) => deniables.has(id)))));
    });

    const id = this.userId();

    if (id === null) {
      this.loading.set(false);
    } else {
      this.userService.findById(id)
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe((user) => {
          this.version.set(user.version);
          this.deniedPermissionIds.set(new Set(user.permissionsRefusees.map((p) => p.id)));
          this.modele.set({
            username: user.username,
            email: user.email,
            motDePasse: '',
            actif: user.actif,
            employeeId: user.employee?.id ?? null,
            roleIds: user.roles.map((r) => r.id)
          });
        });
      this.roleReferenceService.findAllPermissions().subscribe((permissions) => this.permissionCatalogue.set(permissions));
    }
  }

  protected isDenied(permission: PermissionSummary): boolean {
    return this.deniedPermissionIds().has(permission.id);
  }

  protected permissionHeritee(permission: PermissionSummary): boolean {
    return this.deniablePermissions().some((candidate) => candidate.id === permission.id);
  }

  protected onTogglePermission(permission: PermissionSummary, event: Event): void {
    if (!this.permissionHeritee(permission)) {
      return;
    }
    const autorisee = (event.target as HTMLInputElement).checked;
    this.form().markAsDirty();
    this.deniedPermissionIds.update((current) => {
      const next = new Set(current);
      if (autorisee) {
        next.delete(permission.id);
      } else {
        next.add(permission.id);
      }
      return next;
    });
  }

  private async enregistrer(): Promise<void> {
    const saisie = this.modele();
    const id = this.userId();

    const requete$ =
      id !== null
        ? this.userService
            .update(id, { version: this.version()!, email: saisie.email, actif: saisie.actif, employeeId: saisie.employeeId, roleIds: saisie.roleIds })
            .pipe(switchMap((user) => this.userService.updateDeniedPermissions(id, { version: user.version, permissionIds: Array.from(this.deniedPermissionIds()) })))
        : this.userService.create({
            username: saisie.username,
            email: saisie.email,
            motDePasse: saisie.motDePasse,
            employeeId: saisie.employeeId,
            roleIds: saisie.roleIds
          });

    const termine = await attendreEnregistrement(requete$);
    if (!termine) {
      return;
    }
    this.messageService.add({ severity: 'success', summary: id !== null ? 'Utilisateur modifié' : 'Utilisateur créé', life: 4000 });
    this.form().reset();
    this.router.navigate(['/admin/users']);
  }
}
