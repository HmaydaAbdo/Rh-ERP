import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Affichée quand l'utilisateur n'a pas la permission requise par un écran (voir `permissionGuard`). */
@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="app-page app-page--narrow">
      <div class="app-page__header">
        <h1>Accès refusé</h1>
      </div>
      <p class="access-denied__message">
        Vous n'avez pas la permission d'accéder à cet écran. Contactez un administrateur si vous pensez que c'est une erreur.
      </p>
      <a routerLink="/" class="p-button">Retour à l'accueil</a>
    </div>
  `,
  styles: [
    `
      .access-denied__message {
        margin: 0 0 var(--space-lg);
        color: var(--color-text-muted);
      }
    `
  ]
})
export class AccessDeniedComponent {}
