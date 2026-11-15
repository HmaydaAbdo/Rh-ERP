import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { injectInterrupt } from '@copilotkit/angular';

import { ButtonComponent } from '../../shared/ui/button/button.directive';
import { decisions, lireDemandes, lireQuestion } from './accord-ecriture';
import { AccordEcritureComponent } from './accord-ecriture.component';
import { FichiersAssistant } from './fichiers-assistant.service';
import { QuestionUtilisateurComponent } from './question-utilisateur.component';

/**
 * Branche les interruptions du service IA sur la discussion : la question de l'agent (`poser_question`) et l'accord
 * avant écriture s'affichent dans une carte, la réponse reprend le run ; les fichiers approuvés restent
 * téléchargeables sous la discussion.
 */
@Component({
  selector: 'app-accord-interruption',
  imports: [AccordEcritureComponent, QuestionUtilisateurComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (question(); as question) {
      <app-question-utilisateur [question]="question" (repondre)="repondreQuestion($event)" />
    }
    @if (demandes().length > 0) {
      <app-accord-ecriture [demandes]="demandes()" (decision)="repondre($event)" />
    }
    @if (fichiers().length > 0) {
      <div class="fichiers mx-4 my-2" aria-label="Fichiers enregistrés">
        @for (chemin of fichiers(); track chemin) {
          <button type="button" stp-button class="telecharger" (click)="telecharger(chemin)">
            Télécharger {{ chemin }}
          </button>
        }
      </div>
    }
  `
})
export class AccordInterruptionComponent {
  private readonly controle = injectInterrupt<unknown>();
  private readonly fichiersAssistant = inject(FichiersAssistant);

  protected readonly question = computed(() => lireQuestion(this.controle.event()?.value));
  protected readonly demandes = computed(() => lireDemandes(this.controle.event()?.value));
  protected readonly fichiers = signal<string[]>([]);

  protected repondreQuestion(reponse: string): void {
    void this.controle.resolve(reponse);
  }

  protected repondre(approuve: boolean): void {
    const demandes = this.demandes();
    if (approuve) {
      this.fichiers.update((anciens) => [...new Set([...anciens, ...demandes.map((d) => d.chemin).filter(Boolean)])]);
    }
    void this.controle.resolve(decisions(demandes, approuve));
  }

  protected telecharger(chemin: string): void {
    void this.fichiersAssistant.telecharger(chemin);
  }
}
