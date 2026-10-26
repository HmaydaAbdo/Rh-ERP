import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, signal, untracked } from '@angular/core';
import { CopilotChatAssistantMessageRenderer } from '@copilotkit/angular';
import { LucideChevronRight } from '@lucide/angular';

function duree(secondes: number): string {
  if (secondes < 1) {
    return 'quelques secondes';
  }
  if (secondes < 60) {
    return `${Math.round(secondes)} secondes`;
  }
  const minutes = Math.floor(secondes / 60);
  const reste = Math.round(secondes % 60);
  return reste === 0 ? `${minutes} min` : `${minutes} min ${reste} s`;
}

/**
 * Le raisonnement du modèle, replié sous la réponse (emplacement `reasoningMessageComponent` de CopilotKit, qui n'expose
 * pas son libellé anglais). Même comportement que celui de la bibliothèque : ouvert pendant le flux, replié ensuite sauf
 * si l'utilisateur l'a ouvert ; le texte est rendu par le moteur de rendu de la bibliothèque.
 */
@Component({
  selector: 'app-assistant-raisonnement',
  imports: [CopilotChatAssistantMessageRenderer, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="raisonnement" [attr.data-message-id]="message().id">
      <button
        type="button"
        class="raisonnement__titre"
        [attr.aria-expanded]="contenu() ? ouvert() : null"
        [disabled]="!contenu()"
        (click)="basculer()"
      >
        <span>{{ libelle() }}</span>
        @if (contenu()) {
          <svg lucideChevronRight aria-hidden="true" class="raisonnement__chevron" [class.raisonnement__chevron--ouvert]="ouvert()"></svg>
        }
      </button>
      @if (contenu()) {
        <div class="raisonnement__corps" [class.raisonnement__corps--ouvert]="ouvert()">
          <div class="raisonnement__texte">
            <copilot-chat-assistant-message-renderer [content]="contenu()" />
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .raisonnement {
      margin-block: var(--space-2xs);
    }

    .raisonnement__titre {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2xs);
      padding: var(--space-2xs) 0;
      border: 0;
      background: transparent;
      color: var(--color-text-muted);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;

      &:hover:not(:disabled) {
        color: var(--color-text);
      }

      &:disabled {
        cursor: default;
      }
    }

    .raisonnement__chevron {
      width: 0.875rem;
      height: 0.875rem;
      transition: transform var(--duration-base) var(--ease-out);
    }

    .raisonnement__chevron--ouvert {
      transform: rotate(90deg);
    }

    .raisonnement__corps {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows var(--duration-base) var(--ease-out);
    }

    .raisonnement__corps--ouvert {
      grid-template-rows: 1fr;
    }

    .raisonnement__texte {
      overflow: hidden;
      min-height: 0;
      padding-inline-start: var(--space-sm);
      border-inline-start: 2px solid var(--color-border);
      color: var(--color-text-muted);
      font-size: 0.8125rem;
      line-height: 1.5;
    }

    @media (prefers-reduced-motion: reduce) {
      .raisonnement__chevron,
      .raisonnement__corps {
        transition: none;
      }
    }
  `
})
export class AssistantRaisonnementComponent {
  readonly message = input.required<{ id: string; content?: string }>();
  readonly messages = input<readonly { id: string }[]>([]);
  readonly isRunning = input(false);

  protected readonly contenu = computed(() => this.message().content ?? '');
  private readonly enCours = computed(() => {
    const messages = this.messages();
    return this.isRunning() && messages[messages.length - 1]?.id === this.message().id;
  });

  private readonly choixUtilisateur = signal(false);
  protected readonly ouvert = linkedSignal<boolean, boolean>({
    source: this.enCours,
    computation: (enCours, precedent) => (enCours ? true : untracked(this.choixUtilisateur) ? (precedent?.value ?? false) : false)
  });

  /** Instant où le flux commence, conservé après pour afficher la durée. */
  private readonly debut = linkedSignal<boolean, number | undefined>({
    source: this.enCours,
    computation: (enCours, precedent) => (enCours ? (precedent?.value ?? Date.now()) : precedent?.value)
  });

  protected readonly libelle = computed(() => {
    // Lu dans les deux cas : le signal lié reste actif et garde l'instant de début pendant le flux.
    const debut = this.debut();
    return this.enCours() ? 'Réflexion…' : `Réfléchi pendant ${duree(debut === undefined ? 0 : (Date.now() - debut) / 1000)}`;
  });

  protected basculer(): void {
    this.choixUtilisateur.set(true);
    this.ouvert.update((valeur) => !valeur);
  }
}
