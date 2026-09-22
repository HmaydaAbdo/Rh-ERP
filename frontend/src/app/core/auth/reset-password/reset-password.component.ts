import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonModule, PasswordModule],
  templateUrl: './reset-password.component.html',
  styleUrl: '../login/login.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  token: string | null = null;
  submitting = false;
  errorMessage: string | null = null;

  readonly form = this.fb.group({
    nouveauMotDePasse: ['', [Validators.required, Validators.minLength(8)]]
  });

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.errorMessage = 'Lien invalide : jeton manquant.';
    }
  }

  onSubmit(): void {
    if (this.form.invalid || !this.token) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage = null;
    this.submitting = true;
    this.http
      .post('/auth/reset-password', { token: this.token, nouveauMotDePasse: this.form.getRawValue().nouveauMotDePasse })
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => this.router.navigate(['/login']),
        error: (err: HttpErrorResponse) => {
          this.errorMessage =
            err.status === 400 ? 'Ce lien est invalide, expiré ou déjà utilisé.' : 'Une erreur est survenue.';
        }
      });
  }
}
