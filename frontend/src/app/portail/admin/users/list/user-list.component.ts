import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { debounce, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { finalize, map } from 'rxjs';

import { ColumnChooserComponent } from '../../../../shared/components/column-chooser/column-chooser.component';
import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { attendreEnregistrement } from '../../../../shared/forms/soumission';
import { ColumnState } from '../../../../shared/table/table-columns';
import { contient } from '../../../../shared/text/recherche';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../../shared/ui/dialog/dialog.component';
import { FieldErrorComponent } from '../../../../shared/ui/field-error/field-error.component';
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
    FormField,
    FormRoot,
    FieldErrorComponent,
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

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly loading = signal(false);

  protected readonly showResetDialog = signal(false);
  protected readonly resetDialogUser = signal<AdminUser | null>(null);
  private readonly saisieReset = signal({ nouveauMotDePasse: '' });
  protected readonly resetForm = form(
    this.saisieReset,
    (chemin) => {
      required(chemin.nouveauMotDePasse, { message: REGLE_MOT_DE_PASSE });
      motDePasseConforme(chemin.nouveauMotDePasse);
    },
    { submission: { action: () => this.confirmerReset() } }
  );

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
  private readonly criteres = signal<{ username: string; email: string; actif: boolean | null }>({ username: '', email: '', actif: null });
  protected readonly filterForm = form(this.criteres, (chemin) => {
    debounce(chemin.username, DEBOUNCE_FILTRE_MS);
    debounce(chemin.email, DEBOUNCE_FILTRE_MS);
  });

  protected readonly filtres = computed(() => {
    const { username, email, actif } = this.criteres();
    return this.users().filter((user) => contient(user.username, username) && contient(user.email, email) && (actif === null || user.actif === actif));
  });

  constructor() {
    this.fetch();
  }

  protected onResetFilters(): void {
    this.filterForm().reset({ username: '', email: '', actif: null });
  }

  protected onEdit(user: AdminUser): void {
    this.router.navigate(['/admin/users', user.id, 'edit']);
  }

  protected onOpenReset(user: AdminUser): void {
    this.resetDialogUser.set(user);
    this.resetForm().reset({ nouveauMotDePasse: '' });
    this.showResetDialog.set(true);
  }

  protected onCloseReset(): void {
    this.showResetDialog.set(false);
    this.resetDialogUser.set(null);
  }

  private async confirmerReset(): Promise<void> {
    const user = this.resetDialogUser();
    if (!user) {
      return;
    }

    const reinitialise = await attendreEnregistrement(
      this.userService.resetPassword(user.id, { nouveauMotDePasse: this.saisieReset().nouveauMotDePasse }).pipe(map(() => true))
    );
    if (reinitialise) {
      this.messageService.add({ severity: 'success', summary: 'Mot de passe réinitialisé', life: 4000 });
      this.onCloseReset();
    }
  }

  private fetch(): void {
    this.loading.set(true);
    this.userService
      .findAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((users) => this.users.set(users));
  }
}
