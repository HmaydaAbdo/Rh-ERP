import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Page d'authentification : une carte centrée sur le fond de page, avec son titre (`h1`) et sa phrase d'introduction.
 * Le formulaire, ses messages et ses liens sont projetés ; les écrans de connexion, de récupération et de réinitialisation
 * du mot de passe n'ont ainsi aucun style propre. La carte suit le thème de l'application.
 *
 *   <stp-auth-card titre="Bienvenue" description="Connectez-vous à votre compte.">
 *     <form [formRoot]="form" class="app-form">…</form>
 *   </stp-auth-card>
 */
@Component({
  selector: 'stp-auth-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-page">
      <section class="auth-card" aria-labelledby="auth-card-titre">
        <header class="auth-card__intro">
          <h1 id="auth-card-titre">{{ titre() }}</h1>
          @if (description()) {
            <p>{{ description() }}</p>
          }
        </header>
        <ng-content />
      </section>
    </div>
  `,
  styles: `
    @use 'breakpoints' as bp;

    .auth-page {
      display: grid;
      place-items: center;
      min-height: 100svh;
      padding: var(--space-xl) var(--space-md);
      background: var(--color-canvas);
      color: var(--color-text);
    }

    .auth-card {
      display: grid;
      gap: var(--space-lg);
      width: min(100%, 28rem);
      padding: var(--space-xl);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-md);

      @include bp.phone {
        padding: var(--space-lg);
      }
    }

    .auth-card__intro {
      display: grid;
      gap: var(--space-sm);

      h1 {
        margin: 0;
        font-size: var(--text-page-title);
        font-weight: var(--weight-semibold);
        line-height: var(--leading-tight);
      }

      p {
        margin: 0;
        color: var(--color-text-muted);
        font-size: var(--text-base);
        line-height: var(--leading-body);
      }
    }
  `
})
export class AuthCardComponent {
  readonly titre = input.required<string>();
  readonly description = input('');
}
