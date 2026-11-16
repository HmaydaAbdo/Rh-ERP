import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MouvementCartesComponent } from '../../mouvement/cartes/mouvement-cartes.component';
import { SortieEtat } from '../sortie-etat';

/** Vue Cartes des sorties : les départs du mois regroupés par chantier, équipe, fonction ou motif. */
@Component({
  selector: 'app-sortie-cartes',
  imports: [MouvementCartesComponent],
  template: `<app-mouvement-cartes [lignes]="etat.lignes()" [chargement]="etat.chargement()" route="/sorties" libelleUnite="Sorties" libelleCategorie="Motif" />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortieCartesComponent {
  protected readonly etat = inject(SortieEtat);
}
