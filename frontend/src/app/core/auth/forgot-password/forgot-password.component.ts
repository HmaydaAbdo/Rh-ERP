
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { PasswordRecoveryService } from '../services/password-recovery.service';

@Component({
    selector: 'app-forgot-password',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './forgot-password.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: '../login/login.component.scss'
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly passwordRecovery = inject(PasswordRecoveryService);

  readonly submitting = signal(false);
  readonly submitted = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.passwordRecovery
      .requestReset(this.form.getRawValue().email)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe(() => this.submitted.set(true));
  }
}
