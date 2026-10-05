import { CommonModule } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { PasswordModule } from 'primeng/password';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { finalize } from 'rxjs';

import { AdminUser } from '../../models/admin.model';
import { UserService } from '../../services/user.service';
import { ColumnChooserComponent } from '../../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState, TABLE_PAGE_REPORT, TABLE_ROWS_PER_PAGE } from '../../../../shared/table/table-columns';
import { motDePasseConforme, REGLE_MOT_DE_PASSE } from '../../../../shared/validators/mot-de-passe.validator';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { debounceTime } from 'rxjs';

const DEBOUNCE_FILTRE_MS = 300;

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [ColumnChooserComponent, InputTextModule, DropdownModule, 
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    TagModule,
    DialogModule,
    PasswordModule,
    TooltipModule
  ],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss'
})
export class UserListComponent {
  private readonly userService = inject(UserService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  users: AdminUser[] = [];
  loading = false;

  showResetDialog = false;
  resetDialogUser: AdminUser | null = null;
  resetting = false;
  readonly regleMotDePasse = REGLE_MOT_DE_PASSE;

  readonly resetForm = this.fb.group({
    nouveauMotDePasse: ['', [Validators.required, motDePasseConforme]]
  });

  readonly columns = new ColumnState([
    { field: 'username', header: 'Username' },
    { field: 'email', header: 'Email' },
    { field: 'roles', header: 'Rôles', sortField: 'roles.length' },
    { field: 'actif', header: 'Statut' }
  ]);
  readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
  readonly pageReport = TABLE_PAGE_REPORT;

  @ViewChild('dt') private table?: Table;

  readonly actifOptions = [
    { label: 'Actif', value: true },
    { label: 'Inactif', value: false }
  ];

  /** Filtres en temps réel : appliqués côté client sur la liste complète déjà chargée (liste non paginée côté serveur). */
  readonly filterForm = this.fb.group({
    username: [''],
    email: [''],
    actif: [null as boolean | null]
  });

  constructor() {
    this.filterForm.valueChanges.pipe(debounceTime(DEBOUNCE_FILTRE_MS)).subscribe((value) => {
      this.table?.filter(value.username ?? '', 'username', 'contains');
      this.table?.filter(value.email ?? '', 'email', 'contains');
      this.table?.filter(value.actif ?? null, 'actif', 'equals');
    });
    this.fetch();
  }

  onResetFilters(): void {
    this.filterForm.reset();
  }

  onEdit(user: AdminUser): void {
    this.router.navigate(['/admin/users', user.id, 'edit']);
  }

  onOpenReset(user: AdminUser): void {
    this.resetDialogUser = user;
    this.resetForm.reset();
    this.showResetDialog = true;
  }

  onCloseReset(): void {
    this.showResetDialog = false;
    this.resetDialogUser = null;
  }

  onConfirmReset(): void {
    if (this.resetForm.invalid || !this.resetDialogUser) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.resetting = true;
    this.userService
      .resetPassword(this.resetDialogUser.id, { nouveauMotDePasse: this.resetForm.getRawValue().nouveauMotDePasse! })
      .pipe(finalize(() => (this.resetting = false)))
      .subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Mot de passe réinitialisé', life: 4000 });
        this.onCloseReset();
      });
  }

  private fetch(): void {
    this.loading = true;
    this.userService
      .findAll()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((users) => (this.users = users));
  }

  /** Nombre de lignes affichées : la liste complète est en mémoire, le tableau la filtre côté client. */
  total(table: Table): number {
    return table.filteredValue?.length ?? this.users.length;
  }
}
