import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Affichée quand l'utilisateur n'a pas la permission requise par un écran (voir `permissionGuard`). */
@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="access-denied">
      <h1>Accès refusé</h1>
      <p>Vous n'avez pas la permission d'accéder à cet écran. Contactez un administrateur si vous pensez que c'est une erreur.</p>
      <a routerLink="/" class="p-button">Retour à l'accueil</a>
    </div>
  `,
  styles: [
    `
      .access-denied {
        background: var(--color-surface);
        border-radius: var(--radius-md);
        padding: var(--space-lg);
        box-shadow: var(--shadow-sm);
        max-width: 720px;

        h1 {
          margin-top: 0;
          font-size: 1.25rem;
        }

        p {
          color: var(--color-text-muted);
        }
      }
    `
  ]
})
export class AccessDeniedComponent {}
