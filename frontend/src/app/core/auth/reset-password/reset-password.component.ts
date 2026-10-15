import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, lastValueFrom, map, of } from 'rxjs';

import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { motDePasseConforme } from '../../../shared/validators/mot-de-passe.validator';
import { PolitiqueMotDePasseService } from '../../../shared/validators/politique-mot-de-passe.service';
import { PasswordRecoveryService } from '../services/password-recovery.service';

@Component({
    selector: 'app-reset-password',
    imports: [FormField, FormRoot, RouterLink, FieldErrorComponent],
    templateUrl: './reset-password.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: '../login/login.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  private readonly passwordRecovery = inject(PasswordRecoveryService);
  private readonly politique = inject(PolitiqueMotDePasseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly passwordVisible = signal(false);

  private readonly modele = signal({ nouveauMotDePasse: '' });
  readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.nouveauMotDePasse, { message: () => this.politique.regle() });
      motDePasseConforme(chemin.nouveauMotDePasse);
    },
    { submission: { action: () => this.reinitialiser(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  ngOnInit(): void {
    const token = new URLSearchParams(this.route.snapshot.fragment ?? '').get('token');
    this.token.set(token);
    if (token) {
      // Le jeton reste en mémoire pour l'envoi du formulaire, mais disparaît de l'URL affichée.
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    if (!this.token()) {
      this.errorMessage.set('Lien invalide : jeton manquant.');
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  private async reinitialiser(): Promise<void> {
    const token = this.token();
    if (!token) {
      return;
    }

    this.errorMessage.set(null);
    const reussi = await lastValueFrom(
      this.passwordRecovery.resetPassword(token, this.modele().nouveauMotDePasse).pipe(
        map(() => true),
        catchError((err: HttpErrorResponse) => {
          this.errorMessage.set(err.status === 400 ? 'Ce lien est invalide, expiré ou déjà utilisé.' : 'Une erreur est survenue.');
          return of(false);
        })
      )
    );
    if (reussi) {
      this.router.navigate(['/login']);
    }
  }
}
