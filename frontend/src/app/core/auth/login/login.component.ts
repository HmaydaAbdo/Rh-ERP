
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-login',
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './login.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly passwordVisible = signal(false);

  constructor() {
    // Un utilisateur déjà connecté (session restaurée via le cookie Refresh Token) n'a rien à
    // faire sur /login — évite d'afficher le formulaire de connexion par-dessus le shell applicatif.
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl('/');
    }
  }

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required]
  });

  togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);
    const { username, password } = this.form.getRawValue();

    this.authService
      .login(username, password)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          const redirect = this.route.snapshot.queryParamMap.get('redirect') ?? '/';
          this.router.navigateByUrl(redirect);
        },
        error: (err: HttpErrorResponse) => {
          this.errorMessage.set(err.status === 401 ? 'Identifiants invalides.' : 'Une erreur est survenue.');
        }
      });
  }
}
