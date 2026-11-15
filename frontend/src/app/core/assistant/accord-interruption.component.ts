import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { injectInterrupt } from '@copilotkit/angular';

import { ButtonComponent } from '../../shared/ui/button/button.directive';
import { decisions, lireDemandes } from './accord-ecriture';
import { AccordEcritureComponent } from './accord-ecriture.component';
import { FichiersAssistant } from './fichiers-assistant.service';

/**
 * Branche l'interruption du service IA (accord avant écriture) sur la discussion : la demande s'affiche dans une carte,
 * la réponse reprend le run ; les fichiers approuvés restent téléchargeables sous la discussion.
 */
@Component({
  selector: 'app-accord-interruption',
  imports: [AccordEcritureComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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

  protected readonly demandes = computed(() => lireDemandes(this.controle.event()?.value));
  protected readonly fichiers = signal<string[]>([]);

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
