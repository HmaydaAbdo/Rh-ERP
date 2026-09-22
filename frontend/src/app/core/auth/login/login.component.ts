import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { finalize } from 'rxjs';

import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  submitting = false;
  errorMessage: string | null = null;

  constructor() {
    // Un utilisateur déjà connecté (session restaurée via le cookie Refresh Token) n'a rien à
    // faire sur /login — évite d'afficher le formulaire de connexion par-dessus le shell applicatif.
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl('/');
    }
  }

  readonly form = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required]
  });

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage = null;
    this.submitting = true;
    const { username, password } = this.form.getRawValue();

    this.authService
      .login(username!, password!)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => {
          const redirect = this.route.snapshot.queryParamMap.get('redirect') ?? '/';
          this.router.navigateByUrl(redirect);
        },
        error: (err: HttpErrorResponse) => {
          this.errorMessage = err.status === 401 ? 'Identifiants invalides.' : 'Une erreur est survenue.';
        }
      });
  }
}
