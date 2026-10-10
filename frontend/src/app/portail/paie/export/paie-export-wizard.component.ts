import { ChangeDetectionStrategy, Component, effect, inject, model, untracked } from '@angular/core';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { PaieExportEtapeEquipesComponent } from './etapes/equipes-etape.component';
import { PaieExportEtapeFormatComponent } from './etapes/format-etape.component';
import { PaieExportEtapeMarcheComponent } from './etapes/marche-etape.component';
import { PaieExportEtapeMaterielComponent } from './etapes/materiel-etape.component';
import { PaieExportEtapePeriodeComponent } from './etapes/periode-etape.component';
import { PaieExportEtapeRecapComponent } from './etapes/recap-etape.component';
import { PaieExportStore } from './paie-export.store';

/**
 * Assistant d'export de la paie — PDF ou Excel — en étapes guidées : mois (contrôlé dès le choix), format, marché (PDF :
 * limiter le rapport à un chantier, avec ou sans vue d'ensemble), équipes à détailler (facultatif), parc matériel
 * (seulement si un tableau matériel sera imprimé) puis récapitulatif et génération. Une seule sélection d'équipes sert les
 * deux formats (voir docs/report/README.md, « Export unifié PDF/Excel ») ; l'exclusion de la feuille du chantier ne concerne
 * que l'Excel.
 *
 * Cette coque porte la fenêtre, le bandeau d'étapes, le pied de navigation et les écrans de génération ; l'état et la logique
 * sont dans {@link PaieExportStore} (fourni ici), chaque étape dans son composant (`etapes/`).
 */
@Component({
  selector: 'app-paie-export-wizard',
  imports: [
    ButtonComponent,
    DialogComponent,
    IconComponent,
    PaieExportEtapePeriodeComponent,
    PaieExportEtapeFormatComponent,
    PaieExportEtapeMarcheComponent,
    PaieExportEtapeEquipesComponent,
    PaieExportEtapeMaterielComponent,
    PaieExportEtapeRecapComponent
  ],
  providers: [PaieExportStore],
  templateUrl: './paie-export-wizard.component.html',
  styleUrl: './paie-export-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportWizardComponent {
  readonly visible = model(false);

  protected readonly store = inject(PaieExportStore);

  constructor() {
    // À chaque ouverture (visible passe à vrai), l'assistant repart d'un état neuf.
    effect(() => {
      if (this.visible()) {
        untracked(() => this.store.ouvrir());
      }
    });
  }

  /** Une génération en cours ne se ferme pas (le fichier serait perdu). */
  protected setVisible(valeur: boolean): void {
    if (!valeur && this.store.etat() === 'generation') {
      return;
    }
    this.visible.set(valeur);
  }
}
