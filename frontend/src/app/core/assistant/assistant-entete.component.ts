import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LucideSparkles } from '@lucide/angular';

/**
 * En-tête de l'assistant (emplacement `headerComponent` de la barre CopilotKit, qui garde sa croix et son titre
 * accessible) : la marque de l'IA aux couleurs Staport et la promesse de l'assistant.
 */
@Component({
  selector: 'app-assistant-entete',
  imports: [LucideSparkles],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="marque" aria-hidden="true"><svg lucideSparkles></svg></span>
    <div class="titres">
      <h2 class="titre">Assistant RH</h2>
      <p class="sous-titre">Réponses vérifiées sur vos données</p>
    </div>
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
      background: var(--assistant-accent);
      color: var(--assistant-accent-contrast);
      box-shadow: var(--shadow-sm);

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

    .sous-titre {
      margin: 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
  `
})
export class AssistantEnteteComponent {}
