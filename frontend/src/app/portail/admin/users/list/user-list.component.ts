import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, finalize } from 'rxjs';

import { ColumnChooserComponent } from '../../../../shared/components/column-chooser/column-chooser.component';
import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { ColumnState } from '../../../../shared/table/table-columns';
import { contient } from '../../../../shared/text/recherche';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../../shared/ui/dialog/dialog.component';
import { PasswordInputComponent } from '../../../../shared/ui/password-input/password-input.component';
import { SelectComponent } from '../../../../shared/ui/select/select.component';
import { TableCellDirective, TableComponent, TableRowActionsDirective } from '../../../../shared/ui/table/table.component';
import { motDePasseConforme, REGLE_MOT_DE_PASSE } from '../../../../shared/validators/mot-de-passe.validator';
import { AdminUser } from '../../models/admin.model';
import { UserService } from '../../services/user.service';

const DEBOUNCE_FILTRE_MS = 300;

@Component({
  selector: 'app-user-list',
  imports: [
    ColumnChooserComponent,
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    BadgeComponent,
    SelectComponent,
    DialogComponent,
    TableComponent,
    TableCellDirective,
    TableRowActionsDirective,
    PasswordInputComponent
  ],
  templateUrl: './user-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './user-list.component.scss'
})
export class UserListComponent {
  private readonly userService = inject(UserService);
  private readonly messageService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly loading = signal(false);

  protected readonly showResetDialog = signal(false);
  protected readonly resetDialogUser = signal<AdminUser | null>(null);
  protected readonly resetting = signal(false);
  protected readonly regleMotDePasse = REGLE_MOT_DE_PASSE;

  protected readonly resetForm = this.fb.nonNullable.group({
    nouveauMotDePasse: ['', [Validators.required, motDePasseConforme]]
  });

  protected readonly columns = new ColumnState([
    { field: 'username', header: 'Username' },
    { field: 'email', header: 'Email' },
    { field: 'roles', header: 'Rôles', sortField: 'roles.length' },
    { field: 'actif', header: 'Statut' }
  ]);

  protected readonly actifOptions = [
    { label: 'Actif', value: true },
    { label: 'Inactif', value: false }
  ];

  /** Filtres en temps réel : appliqués côté client sur la liste complète déjà chargée (liste non paginée côté serveur). */
  protected readonly filterForm = this.fb.group({
    username: [''],
    email: [''],
    actif: [null as boolean | null]
  });

  private readonly criteres = signal<{ username: string; email: string; actif: boolean | null }>({ username: '', email: '', actif: null });

  protected readonly filtres = computed(() => {
    const { username, email, actif } = this.criteres();
    return this.users().filter((user) => contient(user.username, username) && contient(user.email, email) && (actif === null || user.actif === actif));
  });

  constructor() {
    this.filterForm.valueChanges.pipe(debounceTime(DEBOUNCE_FILTRE_MS), takeUntilDestroyed(inject(DestroyRef))).subscribe((value) => {
      this.criteres.set({ username: value.username ?? '', email: value.email ?? '', actif: value.actif ?? null });
    });
    this.fetch();
  }

  protected onResetFilters(): void {
    this.filterForm.reset();
  }

  protected onEdit(user: AdminUser): void {
    this.router.navigate(['/admin/users', user.id, 'edit']);
  }

  protected onOpenReset(user: AdminUser): void {
    this.resetDialogUser.set(user);
    this.resetForm.reset();
    this.showResetDialog.set(true);
  }

  protected onCloseReset(): void {
    this.showResetDialog.set(false);
    this.resetDialogUser.set(null);
  }

  protected onConfirmReset(): void {
    const user = this.resetDialogUser();
    if (this.resetForm.invalid || !user) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.resetting.set(true);
    this.userService
      .resetPassword(user.id, { nouveauMotDePasse: this.resetForm.getRawValue().nouveauMotDePasse })
      .pipe(finalize(() => this.resetting.set(false)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Mot de passe réinitialisé', life: 4000 });
        this.onCloseReset();
      });
  }

  private fetch(): void {
    this.loading.set(true);
    this.userService
      .findAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((users) => this.users.set(users));
  }
}
