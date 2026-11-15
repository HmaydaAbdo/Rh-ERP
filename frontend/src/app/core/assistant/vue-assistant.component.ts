import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AngularToolCall, ToolRenderer } from '@copilotkit/angular';
import { LucideExternalLink, LucideUndo2 } from '@lucide/angular';

import { validerVue } from './vue-assistant';

/**
 * La vue filtrée proposée par l'agent (KAN-89), dans la discussion : une carte et un bouton « Ouvrir la vue ». L'agent
 * ne navigue jamais : l'utilisateur ouvre la vue d'un clic, et « Revenir » le ramène à l'écran d'où il venait. Les
 * gardes de route et les droits du serveur s'appliquent comme pour toute navigation.
 */
@Component({
  selector: 'app-vue-assistant',
  imports: [LucideExternalLink, LucideUndo2],
  host: { class: 'my-1 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (vue(); as v) {
      <div class="vue-proposee rounded-md border border-border bg-surface-alt px-3 py-2 text-sm text-text">
        <p class="m-0 font-medium">{{ v.libelleDomaine }}</p>
        @if (v.filtres.length) {
          <p class="m-0 mt-0.5 text-xs text-muted">
            @for (f of v.filtres; track f.cle) {
              <span class="me-2">{{ f.cle }} : {{ f.valeur }}</span>
            }
          </p>
        }
        <div class="mt-2 flex gap-2">
          <button type="button" class="ouvrir inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text hover:bg-surface-alt" (click)="ouvrir()">
            <svg lucideExternalLink class="size-3.5" aria-hidden="true"></svg>
            Ouvrir la vue
          </button>
          @if (origine()) {
            <button type="button" class="revenir inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-muted hover:text-text" (click)="revenir()">
              <svg lucideUndo2 class="size-3.5" aria-hidden="true"></svg>
              Revenir
            </button>
          }
        </div>
      </div>
    }
  `
})
export class VueAssistantComponent implements ToolRenderer {
  readonly toolCall = input.required<AngularToolCall<Record<string, unknown>>>();

  private readonly router = inject(Router);
  /** Écran d'où l'utilisateur est parti en ouvrant la vue : sert au retour. */
  protected readonly origine = signal<string | null>(null);
  protected readonly vue = computed(() => {
    const appel = this.toolCall();
    return appel.status === 'in-progress' ? null : validerVue(appel.args?.['domaine'], appel.args?.['filtres']);
  });

  protected async ouvrir(): Promise<void> {
    const vue = this.vue();
    if (vue) {
      const depart = this.router.url;
      if (await this.router.navigateByUrl(vue.url)) {
        this.origine.set(depart);
      }
    }
  }

  protected async revenir(): Promise<void> {
    const depart = this.origine();
    if (depart && (await this.router.navigateByUrl(depart))) {
      this.origine.set(null);
    }
  }
}
