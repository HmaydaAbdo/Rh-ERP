import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { PasswordModule } from 'primeng/password';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { finalize } from 'rxjs';

import { AdminUser } from '../../models/admin.model';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
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
  readonly resetForm = this.fb.group({
    nouveauMotDePasse: ['', [Validators.required, Validators.minLength(8)]]
  });

  constructor() {
    this.fetch();
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
}
