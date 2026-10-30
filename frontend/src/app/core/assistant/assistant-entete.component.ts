import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideSquarePen, LucideSparkles } from '@lucide/angular';

import { FilAssistant } from './fil-assistant.service';

/**
 * En-tête de l'assistant (emplacement `headerComponent` de la barre CopilotKit, qui garde sa croix et son titre
 * accessible) : le monogramme Staport identifie l'assistant numérique dans toutes les applications.
 */
@Component({
  selector: 'app-assistant-entete',
  imports: [LucideSparkles, LucideSquarePen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="signature" aria-hidden="true">
      <img class="monogramme" src="assets/brand/monogramme.svg" alt="" />
      <span class="intelligence"><svg lucideSparkles></svg></span>
    </span>
    <div class="titres">
      <h2 class="titre">Staport Intelligence</h2>
      <p class="sous-titre">Votre assistant numérique</p>
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

    .signature {
      position: relative;
      flex: none;
      width: var(--control-height);
      aspect-ratio: 1;
    }

    .monogramme {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: var(--radius-md);
    }

    .intelligence {
      position: absolute;
      inset-block-end: 0;
      inset-inline-end: 0;
      display: grid;
      place-items: center;
      width: var(--space-md);
      aspect-ratio: 1;
      border: 1px solid var(--color-surface);
      border-radius: var(--radius-pill);
      background: var(--assistant-accent);
      color: var(--assistant-accent-contrast);

      svg {
        width: var(--space-sm-md);
        height: var(--space-sm-md);
      }
    }

    .titre {
      margin: 0;
      font-size: var(--text-md);
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
        outline: 2px solid var(--color-focus);
        outline-offset: 1px;
      }
    }

    .sous-titre {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--color-text-muted);
    }
  `
})
export class AssistantEnteteComponent {
  protected readonly fil = inject(FilAssistant);
}
