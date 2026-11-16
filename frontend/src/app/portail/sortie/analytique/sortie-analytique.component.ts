import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MouvementAnalytiqueComponent } from '../../mouvement/analytique/mouvement-analytique.component';
import { SortieEtat } from '../sortie-etat';

/** Vue Analytique des sorties : répartition du mois par chantier, équipe et fonction, empilée par motif. */
@Component({
  selector: 'app-sortie-analytique',
  imports: [MouvementAnalytiqueComponent],
  template: `<app-mouvement-analytique [lignes]="etat.lignes()" [chargement]="etat.chargement()" libelleUnite="Sorties" libelleCategorie="Motif" />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortieAnalytiqueComponent {
  protected readonly etat = inject(SortieEtat);
}
