import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent } from '../../../shared/ui/icon/icon.component';

/** Affichée quand l'utilisateur n'a pas la permission requise par un écran (voir `permissionGuard`). */
@Component({
    selector: 'app-access-denied',
    imports: [RouterLink, IconComponent],
    template: `
    <div class="app-page app-page--narrow">
      <section class="access-denied" aria-labelledby="acces-refuse-titre">
        <span class="access-denied__repere"><stp-icon name="circle-alert" size="1.5rem" /></span>
        <p class="access-denied__eyebrow">ACCÈS</p>
        <h1 id="acces-refuse-titre">Accès refusé</h1>
        <p class="access-denied__message">
          Votre profil ne dispose pas de la permission nécessaire pour consulter cet écran. Contactez un administrateur si vous pensez que c'est une erreur.
        </p>
        <a routerLink="/" class="access-denied__back"><stp-icon name="arrow-left" /> Retour à l'accueil</a>
      </section>
    </div>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [
        `
      .access-denied__message {
        max-width: 54ch;
        margin: 0;
        color: var(--color-text-muted);
        line-height: 1.6;
      }
      .access-denied {
        display: grid;
        justify-items: start;
        gap: var(--space-md);
        padding-block: var(--space-xl);
      }
      .access-denied__repere {
        display: grid;
        place-items: center;
        width: 3rem;
        height: 3rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-primary-soft);
        color: var(--color-primary);
      }
      .access-denied__eyebrow {
        margin: 0;
        color: var(--color-primary);
        font-size: var(--text-xs);
        font-weight: 600;
        letter-spacing: 0.08em;
      }
      .access-denied h1 {
        margin: calc(-1 * var(--space-sm)) 0 0;
        font-size: var(--text-page-title);
        font-weight: 600;
      }
      .access-denied__back {
        display: inline-flex;
        min-height: var(--control-height);
        gap: var(--space-sm);
        align-items: center;
        padding: 0 var(--space-md);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface-alt);
        color: var(--color-primary);
        font-weight: 600;
        text-decoration: none;
        transition: background-color var(--duration-fast), border-color var(--duration-fast);
      }
      .access-denied__back:hover {
        border-color: var(--color-primary);
        background: var(--color-primary-soft);
      }
      .access-denied__back:focus-visible {
        outline: 3px solid var(--color-focus);
        outline-offset: 2px;
      }
    `
    ]
})
export class AccessDeniedComponent {}
