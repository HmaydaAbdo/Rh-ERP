import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { LucideCheck } from '@lucide/angular';

import { ButtonComponent } from '../../shared/ui/button/button.directive';
import type { QuestionAgent } from './accord-ecriture';

/**
 * Question de l'agent à l'utilisateur, dans la discussion : options à choisir (une ou plusieurs) ou réponse libre. La
 * réponse reprend le run là où l'interruption de l'agent l'avait arrêté (KAN-264).
 */
@Component({
  selector: 'app-question-utilisateur',
  imports: [LucideCheck, ButtonComponent],
  host: { class: 'my-2 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="app-ask" [attr.aria-label]="'Question de l’assistant'">
      <p class="app-ask__title">{{ question().question }}</p>
      @if (!envoyee()) {
        <div class="options app-ask__options" role="group" [attr.aria-label]="question().question">
          @for (option of question().options; track option.label) {
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
            maxlength="400"
            [value]="libre()"
            (input)="libre.set($any($event.target).value)"
          />
          <button type="submit" stp-button class="valider" [disabled]="!pret()">Valider</button>
        </form>
      } @else {
        <p class="reponse app-ask__answer"><svg lucideCheck aria-hidden="true"></svg> {{ reponseEnvoyee() }}</p>
      }
    </section>
  `
})
export class QuestionUtilisateurComponent {
  readonly question = input.required<QuestionAgent>();
  readonly repondre = output<string>();

  protected readonly choix = signal<string[]>([]);
  protected readonly libre = signal('');
  protected readonly envoyee = signal(false);
  protected readonly reponseEnvoyee = signal('');
  protected readonly pret = computed(() => this.choix().length > 0 || this.libre().trim().length > 0);

  protected basculer(label: string): void {
    const multiple = this.question().multiple === true;
    this.choix.update((courant) =>
      courant.includes(label) ? courant.filter((c) => c !== label) : multiple ? [...courant, label] : [label]
    );
  }

  protected envoyer(): void {
    if (!this.pret() || this.envoyee()) {
      return;
    }
    const reponses = [...this.choix(), ...(this.libre().trim() ? [this.libre().trim()] : [])];
    const texte = reponses.join(' ; ');
    this.reponseEnvoyee.set(texte);
    this.envoyee.set(true);
    this.repondre.emit(texte);
  }
}
