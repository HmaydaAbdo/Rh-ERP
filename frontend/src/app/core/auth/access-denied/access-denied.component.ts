import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Affichée quand l'utilisateur n'a pas la permission requise par un écran (voir `permissionGuard`). */
@Component({
    selector: 'app-access-denied',
    imports: [RouterLink],
    template: `
    <div class="app-page app-page--narrow">
      <div class="app-page__header">
        <h1>Accès refusé</h1>
      </div>
      <p class="access-denied__message">
        Vous n'avez pas la permission d'accéder à cet écran. Contactez un administrateur si vous pensez que c'est une erreur.
      </p>
      <a routerLink="/" class="access-denied__back">Retour à l'accueil</a>
    </div>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [
        `
      .access-denied__message {
        margin: 0 0 var(--space-lg);
        color: var(--color-text-muted);
      }
      .access-denied__back {
        display: inline-flex;
        min-height: var(--control-height);
        align-items: center;
        padding: 0 var(--space-md);
        border-radius: var(--radius-sm);
        background: var(--color-primary);
        color: var(--color-primary-contrast);
        font-weight: 600;
        text-decoration: none;
      }
      .access-denied__back:focus-visible {
        outline: 3px solid var(--color-focus);
        outline-offset: 2px;
      }
    `
    ]
})
export class AccessDeniedComponent {}
