import { ChangeDetectionStrategy, Component, effect, inject, input, model, output, untracked } from '@angular/core';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';
import { PaieImportEtapeControleComponent } from './etapes/controle-etape.component';
import { fichierChoisi, PaieImportStore } from './paie-import.store';

/**
 * Assistant d'import de la paie en quatre étapes : fichier, contrôle, départs, import (voir `PaieImportStore`). L'étape
 * « Contrôle » est un composant à part (`etapes/`) ; cette coque porte la fenêtre, le bandeau d'étapes, les autres étapes
 * et le pied. L'import n'est proposé qu'une fois le fichier en accord avec les fiches.
 */
@Component({
  selector: 'app-paie-import-wizard',
  imports: [ButtonComponent, DialogComponent, IconComponent, MessageComponent, MonthInputComponent, PaieImportEtapeControleComponent],
  providers: [PaieImportStore],
  templateUrl: './paie-import-wizard.component.html',
  styleUrl: './paie-import-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieImportWizardComponent {
  readonly visible = model(false);
  /** Mois déjà importés, du plus récent au plus ancien : le mois à importer est celui qui suit le premier. */
  readonly periodes = input<string[]>([]);
  /** Un import a réussi : la page recharge la vue. */
  readonly importe = output<void>();

  protected readonly store = inject(PaieImportStore);

  constructor() {
    effect(() => {
      if (this.visible()) {
        untracked(() => this.store.ouvrir(this.periodes()));
      }
    });
  }

  /** Un import en cours ne se ferme pas. */
  protected setVisible(valeur: boolean): void {
    if (!valeur && this.store.etat() === 'import') {
      return;
    }
    this.visible.set(valeur);
  }

  protected surFichier(evenement: Event): void {
    const fichier = fichierChoisi(evenement);
    if (fichier) {
      this.store.analyser(fichier);
    }
  }

  protected importer(): void {
    this.store.importer(() => this.importe.emit());
  }

  protected texte(evenement: Event): string {
    return (evenement.target as HTMLInputElement).value;
  }

  protected coche(evenement: Event): boolean {
    return (evenement.target as HTMLInputElement).checked;
  }
}
