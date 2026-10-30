import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { HumanInTheLoopToolCall, HumanInTheLoopToolRenderer } from '@copilotkit/angular';
import { LucideCheck } from '@lucide/angular';
import { z } from 'zod';

/** Nom de l'outil que l'agent appelle pour interroger l'utilisateur ; déclaré par le navigateur (human-in-the-loop). */
export const OUTIL_QUESTION = 'poser_question';

export const DESCRIPTION_QUESTION =
  'Pose une question à l\'utilisateur et attend sa réponse. À utiliser quand la demande est ambiguë ou qu\'un choix change ' +
  'le résultat (période, périmètre, critère de classement, sens du mot « entrées »…), plutôt que de deviner. Donne 2 à 5 ' +
  'options courtes et distinctes ; l\'utilisateur peut aussi répondre librement. Ne l\'utilise jamais pour une valeur ' +
  'qu\'une application connectée peut donner, ni pour une salutation.';

export const PARAMETRES_QUESTION = z.object({
  question: z.string().describe('La question, en français, courte et précise.'),
  options: z
    .array(z.object({ label: z.string().describe('Texte court de l\'option.'), description: z.string().optional() }))
    .min(2)
    .max(5)
    .describe('Les réponses proposées.'),
  multiple: z.boolean().optional().describe('Vrai si plusieurs options peuvent être choisies.')
});

type ArgumentsQuestion = z.infer<typeof PARAMETRES_QUESTION>;

/**
 * Question de l'agent à l'utilisateur, dans la discussion : options à choisir (une ou plusieurs) ou réponse libre. La
 * réponse repart vers l'agent comme résultat de l'outil, et le run reprend là où il s'était arrêté.
 */
@Component({
  selector: 'app-question-utilisateur',
  imports: [LucideCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="question" [attr.aria-label]="'Question de l’assistant'">
      <p class="intitule">{{ args().question }}</p>
      @if (!repondue()) {
        <div class="options" role="group" [attr.aria-label]="args().question">
          @for (option of args().options ?? []; track option.label) {
            <button
              type="button"
              class="option"
              [class.choisie]="choix().includes(option.label)"
              [attr.aria-pressed]="choix().includes(option.label)"
              (click)="basculer(option.label)"
            >
              <span class="coche" aria-hidden="true"><svg lucideCheck></svg></span>
              <span class="texte">
                {{ option.label }}
                @if (option.description) {
                  <small>{{ option.description }}</small>
                }
              </span>
            </button>
          }
        </div>
        <form class="libre" (submit)="$event.preventDefault(); envoyer()">
          <input
            type="text"
            placeholder="Ou répondez avec vos mots…"
            aria-label="Réponse libre"
            [value]="libre()"
            (input)="libre.set($any($event.target).value)"
          />
          <button type="submit" class="valider" [disabled]="!pret()">Valider</button>
        </form>
      } @else {
        <p class="reponse"><svg lucideCheck aria-hidden="true"></svg> {{ resultat() }}</p>
      }
    </section>
  `,
  styles: `
    :host { display: block; margin: var(--space-sm) 0; }
    .question {
      display: grid;
      gap: var(--space-sm);
      padding: var(--space-md);
      border: 1px solid var(--color-border);
      border-left: 3px solid var(--assistant-accent);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .intitule { margin: 0; font-size: var(--text-base); font-weight: 600; color: var(--color-text); }
    .options { display: grid; gap: var(--space-xs); }
    .option {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      width: 100%;
      padding: var(--space-sm) var(--space-sm-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: transparent;
      font: inherit;
      font-size: var(--text-sm);
      text-align: left;
      color: var(--color-text);
      cursor: pointer;
      &:hover { background: var(--color-surface-alt); }
      &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
      &.choisie { border-color: var(--color-primary); background: var(--color-primary-soft); }
      small { display: block; color: var(--color-text-muted); font-size: var(--text-xs); }
    }
    .coche {
      display: grid;
      place-items: center;
      flex: none;
      width: 1.125rem;
      height: 1.125rem;
      margin-top: 0.0625rem;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      color: transparent;
      svg { width: 0.75rem; height: 0.75rem; }
    }
    .choisie .coche { border-color: var(--color-primary); background: var(--color-primary); color: var(--color-primary-contrast); }
    .libre { display: flex; gap: var(--space-xs); }
    .libre input {
      flex: 1;
      min-width: 0;
      padding: var(--space-xs) var(--space-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface-alt);
      font: inherit;
      font-size: var(--text-sm);
      color: var(--color-text);
      &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
    }
    .valider {
      padding: var(--space-xs) var(--space-md);
      border: 0;
      border-radius: var(--radius-md);
      background: var(--color-primary);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 600;
      color: var(--color-primary-contrast);
      cursor: pointer;
      &:disabled { opacity: 0.5; cursor: default; }
      &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
    }
    .reponse {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      margin: 0;
      font-size: var(--text-sm);
      color: var(--color-text-muted);
      svg { width: 0.875rem; height: 0.875rem; color: var(--color-success); }
    }
  `
})
export class QuestionUtilisateurComponent implements HumanInTheLoopToolRenderer<ArgumentsQuestion> {
  readonly toolCall = input.required<HumanInTheLoopToolCall<ArgumentsQuestion>>();

  protected readonly args = computed(() => this.toolCall().args as Partial<ArgumentsQuestion> as ArgumentsQuestion);
  protected readonly choix = signal<string[]>([]);
  protected readonly libre = signal('');
  protected readonly repondue = computed(() => this.toolCall().status === 'complete' || this.envoyee());
  protected readonly resultat = computed(() => {
    const appel = this.toolCall();
    return appel.status === 'complete' ? appel.result : this.reponseEnvoyee();
  });
  protected readonly pret = computed(() => this.choix().length > 0 || this.libre().trim().length > 0);

  private readonly envoyee = signal(false);
  private readonly reponseEnvoyee = signal('');

  protected basculer(label: string): void {
    const multiple = this.args().multiple === true;
    this.choix.update((courant) =>
      courant.includes(label) ? courant.filter((c) => c !== label) : multiple ? [...courant, label] : [label]
    );
  }

  protected envoyer(): void {
    const appel = this.toolCall();
    if (!this.pret() || appel.status === 'in-progress') {
      return;
    }
    const reponses = [...this.choix(), ...(this.libre().trim() ? [this.libre().trim()] : [])];
    const texte = reponses.join(' ; ');
    this.reponseEnvoyee.set(texte);
    this.envoyee.set(true);
    appel.respond(texte);
  }
}
