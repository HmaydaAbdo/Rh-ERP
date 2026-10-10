
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { motDePasseConforme, REGLE_MOT_DE_PASSE } from '../../../shared/validators/mot-de-passe.validator';
import { PasswordRecoveryService } from '../services/password-recovery.service';

@Component({
    selector: 'app-reset-password',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './reset-password.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: '../login/login.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly passwordRecovery = inject(PasswordRecoveryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly regle = REGLE_MOT_DE_PASSE;
  readonly token = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly passwordVisible = signal(false);

  readonly form = this.fb.nonNullable.group({
    nouveauMotDePasse: ['', [Validators.required, motDePasseConforme]]
  });

  ngOnInit(): void {
    this.token.set(this.route.snapshot.queryParamMap.get('token'));
    if (!this.token()) {
      this.errorMessage.set('Lien invalide : jeton manquant.');
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  onSubmit(): void {
    const token = this.token();
    if (this.form.invalid || !token) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);
    this.passwordRecovery
      .resetPassword(token, this.form.getRawValue().nouveauMotDePasse)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.router.navigate(['/login']),
        error: (err: HttpErrorResponse) => {
          this.errorMessage.set(
            err.status === 400 ? 'Ce lien est invalide, expiré ou déjà utilisé.' : 'Une erreur est survenue.'
          );
        }
      });
  }
}
