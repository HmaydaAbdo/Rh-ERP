import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideSquarePen, LucideSparkles } from '@lucide/angular';

import { FilAssistant } from './fil-assistant.service';

/**
 * En-tête de l'assistant (emplacement `headerComponent` de la barre CopilotKit, qui garde sa croix et son titre
 * accessible) : le monogramme Staport identifie l'assistant numérique dans toutes les applications.
 */
@Component({
  selector: 'app-assistant-entete',
  host: { class: 'flex min-w-0 items-center gap-2' },
  imports: [LucideSparkles, LucideSquarePen],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="relative size-(--control-height) flex-none" aria-hidden="true">
      <img class="block size-full rounded-md" src="assets/brand/monogramme.svg" alt="" />
      <span class="absolute end-0 bottom-0 grid size-4 place-items-center rounded-full border border-surface bg-primary text-primary-contrast"><svg lucideSparkles class="size-3"></svg></span>
    </span>
    <div class="min-w-0 flex-1">
      <h2 class="m-0 text-md font-semibold text-text">Staport Intelligence</h2>
      <p class="m-0 text-xs text-muted">Votre assistant numérique</p>
    </div>
    <button type="button" class="grid size-8 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-surface-alt hover:text-text" (click)="fil.nouveau()" aria-label="Nouvelle conversation" title="Nouvelle conversation">
      <svg lucideSquarePen class="size-4" aria-hidden="true"></svg>
    </button>
  `
})
export class AssistantEnteteComponent {
  protected readonly fil = inject(FilAssistant);
}
