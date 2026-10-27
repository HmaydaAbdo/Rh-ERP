import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideSquarePen, LucideSparkles } from '@lucide/angular';

import { FilAssistant } from './fil-assistant.service';

/**
 * En-tête de l'assistant (emplacement `headerComponent` de la barre CopilotKit, qui garde sa croix et son titre
 * accessible) : la marque de l'IA aux couleurs Staport et la promesse de l'assistant.
 */
@Component({
  selector: 'app-assistant-entete',
  imports: [LucideSparkles, LucideSquarePen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="marque" aria-hidden="true"><svg lucideSparkles></svg></span>
    <div class="titres">
      <h2 class="titre">Assistant RH</h2>
      <p class="sous-titre">Réponses vérifiées sur vos données</p>
    </div>
    <button type="button" class="nouvelle" (click)="fil.nouveau()" aria-label="Nouvelle conversation" title="Nouvelle conversation">
      <svg lucideSquarePen aria-hidden="true"></svg>
    </button>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-width: 0;
    }

    .marque {
      display: grid;
      flex: none;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: var(--radius-lg);
      background: linear-gradient(135deg, var(--assistant-accent), color-mix(in srgb, var(--assistant-accent) 60%, var(--color-primary)));
      color: var(--assistant-accent-contrast);
      box-shadow: 0 4px 14px color-mix(in srgb, var(--assistant-accent) 35%, transparent);

      svg {
        width: 1.125rem;
        height: 1.125rem;
      }
    }

    .titre {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      line-height: 1.2;
      color: var(--color-text);
    }

    .titres {
      flex: 1;
      min-width: 0;
    }

    .nouvelle {
      display: grid;
      flex: none;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;

      svg {
        width: 1rem;
        height: 1rem;
      }

      &:hover {
        background: var(--color-surface-alt);
        color: var(--color-text);
      }

      &:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 1px;
      }
    }

    .sous-titre {
      margin: 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
  `
})
export class AssistantEnteteComponent {
  protected readonly fil = inject(FilAssistant);
}
