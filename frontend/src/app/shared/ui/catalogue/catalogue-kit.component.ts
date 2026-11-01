import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { BadgeComponent } from '../badge/badge.component';
import { ButtonComponent } from '../button/button.directive';
import { IconComponent } from '../icon/icon.component';
import { MessageComponent } from '../message/message.component';
import { StepperComponent, StepperEtape } from '../stepper/stepper.component';
import { WizardStateComponent } from '../wizard-state/wizard-state.component';

/**
 * Seconde moitié du catalogue : le vocabulaire des feuilles partagées (`src/styles/`) et les composants d'assistant, montrés avec des
 * données locales fixes, sans backend. Chaque bloc correspond à une famille de classes `app-*` ; un écran de domaine les compose.
 */
@Component({
  selector: 'app-catalogue-kit',
  imports: [BadgeComponent, ButtonComponent, IconComponent, MessageComponent, StepperComponent, WizardStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalogue-kit.component.html'
})
export class CatalogueKitComponent {
  protected readonly etapes: readonly StepperEtape[] = [
    { id: 'periode', libelle: 'Période' },
    { id: 'format', libelle: 'Format' },
    { id: 'recap', libelle: 'Récapitulatif' }
  ];
  protected readonly etapeCourante = signal('format');
  protected readonly indexCourant = signal(1);
  protected readonly format = signal<'PDF' | 'EXCEL'>('PDF');
  protected readonly moisOuvert = signal(false);
  protected readonly choisis = signal<readonly string[]>(['C168']);

  protected allerA(id: string): void {
    const index = this.etapes.findIndex((e) => e.id === id);
    if (index < this.indexCourant()) {
      this.etapeCourante.set(id);
      this.indexCourant.set(index);
    }
  }

  protected basculer(code: string): void {
    this.choisis.update((liste) => (liste.includes(code) ? liste.filter((c) => c !== code) : [...liste, code]));
  }
}
