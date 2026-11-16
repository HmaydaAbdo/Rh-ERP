import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';
import { LucideCheck, LucideCircleAlert, LucideLoaderCircle, LucideLock } from '@lucide/angular';

import { criteresMontres, etatConsultation, OUTILS_SANS_CARTE } from './carte-outil';
import { OutilsAssistant } from './outils-assistant.service';

/**
 * La consultation d'un outil métier dans la discussion (KAN-87) : un titre français, son domaine et son état, avec les
 * critères utilisés dans un repli. Jamais de nom technique ni de données brutes : les valeurs sont dans la réponse, le
 * tableau ou la surface A2UI. Enregistré comme rendu universel (`*`) : un outil inconnu a une carte générique.
 */
@Component({
  selector: 'app-carte-outil',
  imports: [LucideCheck, LucideCircleAlert, LucideLoaderCircle, LucideLock],
  host: { class: 'my-1 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <details class="carte-outil rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-text">
        <summary class="flex cursor-pointer list-none items-center gap-2">
          <span class="flex-none" role="img" [attr.aria-label]="libelleEtat()">
            @switch (etat()) {
              @case ('en-cours') { <svg lucideLoaderCircle class="size-4 animate-spin text-muted" aria-hidden="true"></svg> }
              @case ('terminee') { <svg lucideCheck class="size-4 text-primary" aria-hidden="true"></svg> }
              @case ('refusee') { <svg lucideLock class="size-4 text-muted" aria-hidden="true"></svg> }
              @default { <svg lucideCircleAlert class="size-4 text-muted" aria-hidden="true"></svg> }
            }
          </span>
          <span class="min-w-0 flex-1 truncate">{{ titre() }}</span>
          @if (domaine()) {
            <span class="flex-none text-xs text-muted">{{ domaine() }}</span>
          }
        </summary>
        <p class="m-0 mt-1 text-xs text-muted">{{ libelleEtat() }}</p>
        @if (criteres().length) {
          <dl class="m-0 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            @for (critere of criteres(); track critere.libelle) {
              <dt class="text-muted">{{ critere.libelle }}</dt>
              <dd class="m-0 text-text">{{ critere.valeur }}</dd>
            }
          </dl>
        }
      </details>
    }
  `
})
export class CarteOutilComponent implements ToolRenderer {
  readonly toolCall = input.required<AngularToolCall<Record<string, unknown>>>();

  private readonly outils = inject(OutilsAssistant);
  protected readonly visible = computed(() => !OUTILS_SANS_CARTE.has(this.toolCall().name ?? ''));
  protected readonly etat = computed(() => etatConsultation(this.toolCall().status, this.toolCall().result));
  protected readonly criteres = computed(() => criteresMontres(this.toolCall().args));
  private readonly connu = computed(() => this.outils.titres()[this.toolCall().name ?? '']);
  protected readonly titre = computed(() => this.connu()?.title ?? 'Consultation des données');
  protected readonly domaine = computed(() => this.connu()?.domain ?? '');
  protected readonly libelleEtat = computed(() => {
    switch (this.etat()) {
      case 'en-cours':
        return 'Consultation en cours';
      case 'terminee':
        return 'Consultation terminée';
      case 'refusee':
        return 'Accès refusé : vous n’avez pas ce droit';
      default:
        return 'Information momentanément indisponible';
    }
  });

  constructor() {
    void this.outils.charger();
  }
}
