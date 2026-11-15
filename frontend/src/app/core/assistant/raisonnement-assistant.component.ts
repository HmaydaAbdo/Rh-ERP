import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, signal, untracked } from '@angular/core';
import { CopilotChatAssistantMessageRenderer } from '@copilotkit/angular';
import { LucideChevronRight, LucideSparkles } from '@lucide/angular';
import type { Message, ReasoningMessage } from '@ag-ui/core';

import { dureeReflexion } from './raisonnement-assistant';

/**
 * Le message de raisonnement de l'assistant aux couleurs de Staport (KAN-88) : libellé français, carte de l'ERP,
 * repliable. Branché sur l'emplacement officiel `reasoningMessageComponent` de la discussion CopilotKit, qui lui donne
 * `message`, `messages` et `isRunning` ; le texte (Markdown) est rendu par le composant officiel de CopilotKit.
 * Ouvert pendant la réflexion, replié ensuite, sauf si l'utilisateur a choisi (comme le composant d'origine).
 */
@Component({
  selector: 'app-raisonnement-assistant',
  imports: [CopilotChatAssistantMessageRenderer, LucideChevronRight, LucideSparkles],
  host: { class: 'my-1 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="raisonnement rounded-md border border-border bg-surface-alt text-sm text-muted">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-start text-sm text-muted hover:text-text disabled:cursor-default disabled:hover:text-muted"
        [disabled]="!avecTexte()"
        [attr.aria-expanded]="avecTexte() ? ouvert() : null"
        (click)="basculer()"
      >
        <svg lucideSparkles class="size-4 flex-none text-primary" aria-hidden="true"></svg>
        <span class="min-w-0 flex-1 font-medium">{{ libelle() }}</span>
        @if (avecTexte()) {
          <svg lucideChevronRight class="size-4 flex-none transition-transform" [class.rotate-90]="ouvert()" aria-hidden="true"></svg>
        }
      </button>
      @if (avecTexte() && ouvert()) {
        <div class="border-t border-border px-3 py-2 text-sm text-muted">
          <copilot-chat-assistant-message-renderer [content]="texte()" />
        </div>
      }
    </div>
  `
})
export class RaisonnementAssistantComponent {
  readonly message = input.required<ReasoningMessage>();
  readonly messages = input<Message[]>([]);
  readonly isRunning = input(false);

  private readonly choisi = signal(false);
  private readonly derniere = computed(() => this.messages().at(-1)?.id === this.message().id);
  protected readonly enCours = computed(() => this.isRunning() && this.derniere());
  protected readonly texte = computed(() => this.message().content ?? '');
  protected readonly avecTexte = computed(() => this.texte().length > 0);

  /** Ouvert pendant la réflexion ; replié ensuite, sauf si l'utilisateur a basculé la carte lui-même. */
  protected readonly ouvert = linkedSignal<boolean, boolean>({
    source: this.enCours,
    computation: (enCours, precedent) => (enCours ? true : untracked(() => this.choisi()) ? (precedent?.value ?? false) : false)
  });

  private readonly debut = linkedSignal<boolean, number | undefined>({
    source: this.enCours,
    computation: (enCours, precedent) => (enCours ? (precedent?.value ?? Date.now()) : precedent?.value)
  });

  protected readonly libelle = computed(() => {
    const debut = this.debut();
    if (this.enCours()) {
      return 'Réflexion en cours…';
    }
    return `Réflexion de ${dureeReflexion(debut === undefined ? 0 : (Date.now() - debut) / 1000)}`;
  });

  protected basculer(): void {
    if (this.avecTexte()) {
      this.choisi.set(true);
      this.ouvert.update((ouvert) => !ouvert);
    }
  }
}
