import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideArrowLeft, LucideArrowUpRight } from '@lucide/angular';

import { OuvertureVueService } from './ouverture-vue.service';

/**
 * Sous la réponse : la vue que l'assistant vient d'ouvrir, avec ses filtres, et le retour à l'écran précédent en un
 * clic ; ou, si une garde de route a refusé (droit absent, saisie non enregistrée), la possibilité de réessayer.
 */
@Component({
  selector: 'app-assistant-vue-ouverte',
  imports: [LucideArrowLeft, LucideArrowUpRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ouverture(); as o) {
      @if (o.statut === 'ouverte') {
        <section class="vue" aria-live="polite">
          <svg lucideArrowUpRight class="vue__icone" aria-hidden="true"></svg>
          <div class="vue__texte">
            <p class="vue__titre">Vue ouverte : <strong>{{ o.cible.libelle }}</strong></p>
            @if (o.cible.filtres.length > 0) {
              <p class="vue__filtres">
                @for (filtre of o.cible.filtres; track filtre) {
                  <span>{{ filtre }}</span>
                }
              </p>
            }
          </div>
          <button type="button" class="vue__action" (click)="service.revenir()">
            <svg lucideArrowLeft aria-hidden="true"></svg>Revenir
          </button>
        </section>
      } @else {
        <section class="vue vue--refusee" role="status">
          <p class="vue__titre">
            Vue non ouverte : <strong>{{ o.cible.libelle }}</strong> (droit absent ou saisie en cours).
          </p>
          <button type="button" class="vue__action" (click)="service.rouvrir()">Réessayer</button>
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .vue {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      margin-block: var(--space-sm);
      padding: var(--space-sm) var(--space-sm-md);
      border: 1px solid var(--color-border);
      border-inline-start: 3px solid var(--assistant-accent);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      animation: vue-entree var(--duration-base) var(--ease-out) both;
    }

    .vue--refusee {
      border-inline-start-color: var(--color-warning);
    }

    .vue__icone {
      flex: none;
      width: 1.125rem;
      height: 1.125rem;
      color: var(--assistant-accent);
    }

    .vue__texte {
      flex: 1;
      min-width: 0;
    }

    .vue__titre,
    .vue__filtres {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.45;
    }

    .vue__filtres {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2xs);
      margin-top: var(--space-2xs);

      span {
        padding: 0 var(--space-xs);
        border-radius: var(--radius-pill);
        background: var(--color-surface-alt);
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
    }

    .vue__action {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2xs);
      flex: none;
      padding: var(--space-2xs) var(--space-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-primary);
      font: inherit;
      font-size: 0.8125rem;
      cursor: pointer;

      svg {
        width: 0.875rem;
        height: 0.875rem;
      }

      &:hover {
        background: var(--color-primary-soft);
      }
    }

    @keyframes vue-entree {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
    }
  `
})
export class AssistantVueOuverteComponent {
  protected readonly service = inject(OuvertureVueService);
  protected readonly ouverture = this.service.ouverture;
}
