import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, lastValueFrom, map, of } from 'rxjs';

import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-login',
    imports: [FormField, FormRoot, RouterLink, FieldErrorComponent],
    templateUrl: './login.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly errorMessage = signal<string | null>(null);
  readonly passwordVisible = signal(false);

  private readonly modele = signal({ username: '', password: '' });
  readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.username, { message: 'Champ obligatoire.' });
      required(chemin.password, { message: 'Champ obligatoire.' });
    },
    { submission: { action: () => this.connecter(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    // Un utilisateur déjà connecté (session restaurée via le cookie Refresh Token) n'a rien à
    // faire sur /login — évite d'afficher le formulaire de connexion par-dessus le shell applicatif.
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl('/');
    }
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  private async connecter(): Promise<void> {
    this.errorMessage.set(null);
    const { username, password } = this.modele();

    const connecte = await lastValueFrom(
      this.authService.login(username, password).pipe(
        map(() => true),
        catchError((err: HttpErrorResponse) => {
          this.errorMessage.set(err.status === 401 ? 'Identifiants invalides.' : 'Une erreur est survenue.');
          return of(false);
        })
      )
    );
    if (connecte) {
      this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('redirect') ?? '/');
    }
  }
}
