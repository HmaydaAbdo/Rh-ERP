import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { HumanInTheLoopToolCall, HumanInTheLoopToolRenderer } from '@copilotkit/angular';
import { ButtonComponent } from '../../shared/ui/button/button.directive';
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
  imports: [LucideCheck, ButtonComponent],
  host: { class: 'my-2 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-ask" [attr.aria-label]="'Question de l’assistant'">
      <p class="app-ask__title">{{ args().question }}</p>
      @if (!repondue()) {
        <div class="options app-ask__options" role="group" [attr.aria-label]="args().question">
          @for (option of args().options ?? []; track option.label) {
            <button
              type="button"
              class="option app-choice-btn"
              [attr.aria-pressed]="choix().includes(option.label)"
              (click)="basculer(option.label)"
            >
              <span class="app-choice-btn__box" aria-hidden="true"><svg lucideCheck></svg></span>
              <span class="texte">
                {{ option.label }}
                @if (option.description) {
                  <small>{{ option.description }}</small>
                }
              </span>
            </button>
          }
        </div>
        <form class="app-ask__free" (submit)="$event.preventDefault(); envoyer()">
          <input
            class="stp-input"
            type="text"
            placeholder="Ou répondez avec vos mots…"
            aria-label="Réponse libre"
            [value]="libre()"
            (input)="libre.set($any($event.target).value)"
          />
          <button type="submit" stp-button class="valider" [disabled]="!pret()">Valider</button>
        </form>
      } @else {
        <p class="reponse app-ask__answer"><svg lucideCheck aria-hidden="true"></svg> {{ resultat() }}</p>
      }
    </section>
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
