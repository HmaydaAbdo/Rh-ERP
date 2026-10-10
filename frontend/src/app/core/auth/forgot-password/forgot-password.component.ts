import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { email, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { catchError, lastValueFrom, map, of } from 'rxjs';

import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { PasswordRecoveryService } from '../services/password-recovery.service';

@Component({
    selector: 'app-forgot-password',
    imports: [FormField, FormRoot, RouterLink, FieldErrorComponent],
    templateUrl: './forgot-password.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: '../login/login.component.scss'
})
export class ForgotPasswordComponent {
  private readonly passwordRecovery = inject(PasswordRecoveryService);

  readonly submitted = signal(false);

  private readonly modele = signal({ email: '' });
  readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.email, { message: 'Email invalide.' });
      email(chemin.email, { message: 'Email invalide.' });
    },
    { submission: { action: () => this.envoyer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  private async envoyer(): Promise<void> {
    const envoye = await lastValueFrom(
      this.passwordRecovery.requestReset(this.modele().email).pipe(
        map(() => true),
        catchError(() => of(false))
      )
    );
    if (envoye) {
      this.submitted.set(true);
    }
  }
}
