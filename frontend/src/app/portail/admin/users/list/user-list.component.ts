import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { debounce, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { finalize, map } from 'rxjs';

import { ColumnChooserComponent } from '../../../../shared/components/column-chooser/column-chooser.component';
import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { surChangementDesFiltres } from '../../../../shared/forms/filtres';
import { attendreEnregistrement } from '../../../../shared/forms/soumission';
import { ColumnState } from '../../../../shared/table/table-columns';
import { BadgeComponent } from '../../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../../shared/ui/dialog/dialog.component';
import { FieldErrorComponent } from '../../../../shared/ui/field-error/field-error.component';
import { PasswordInputComponent } from '../../../../shared/ui/password-input/password-input.component';
import { SelectComponent } from '../../../../shared/ui/select/select.component';
import { TableCellDirective, TableComponent, TableLazyLoadEvent, TableRowActionsDirective } from '../../../../shared/ui/table/table.component';
import { motDePasseConforme } from '../../../../shared/validators/mot-de-passe.validator';
import { PolitiqueMotDePasseService } from '../../../../shared/validators/politique-mot-de-passe.service';
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
  private readonly politique = inject(PolitiqueMotDePasseService);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly loading = signal(false);
  protected readonly first = signal(0);

  protected readonly showResetDialog = signal(false);
  protected readonly resetDialogUser = signal<AdminUser | null>(null);
  private readonly saisieReset = signal({ nouveauMotDePasse: '' });
  protected readonly resetForm = form(
    this.saisieReset,
    (chemin) => {
      required(chemin.nouveauMotDePasse, { message: () => this.politique.regle() });
      motDePasseConforme(chemin.nouveauMotDePasse);
    },
    { submission: { action: () => this.confirmerReset() } }
  );

  protected readonly columns = new ColumnState([
    { field: 'username', header: 'Username' },
    { field: 'email', header: 'Email' },
    { field: 'roles', header: 'Rôles', sortable: false },
    { field: 'actif', header: 'Statut' }
  ]);

  protected readonly actifOptions = [
    { label: 'Actif', value: true },
    { label: 'Inactif', value: false }
  ];

  /** Filtres envoyés au serveur (recherche paginée) : la saisie texte est retardée par la règle `debounce` du formulaire. */
  protected readonly filtres = signal<{ username: string; email: string; actif: boolean | null }>({ username: '', email: '', actif: null });
  protected readonly filterForm = form(this.filtres, (chemin) => {
    debounce(chemin.username, DEBOUNCE_FILTRE_MS);
    debounce(chemin.email, DEBOUNCE_FILTRE_MS);
  });

  private lastPage = 0;
  private lastSize = 10;
  private lastSort = 'username,asc';

  constructor() {
    surChangementDesFiltres(this.filtres, () => this.onSearch());
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    this.first.set(event.first);
    const size = event.rows;
    this.lastPage = size > 0 ? Math.floor(event.first / size) : 0;
    this.lastSize = size;
    this.lastSort = event.sortField ? `${event.sortField},${event.sortOrder === -1 ? 'desc' : 'asc'}` : this.lastSort;

    this.fetchPage();
  }

  protected onSearch(): void {
    this.first.set(0);
    this.lastPage = 0;
    this.fetchPage();
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

  private fetchPage(): void {
    this.loading.set(true);
    const { username, email, actif } = this.filtres();

    this.userService
      .search({ username: username || undefined, email: email || undefined, actif: actif ?? undefined }, { page: this.lastPage, size: this.lastSize, sort: this.lastSort })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((result) => {
        this.users.set(result.content);
        this.totalRecords.set(result.page.totalElements);
      });
  }
}
