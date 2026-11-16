import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MouvementCartesComponent } from '../../mouvement/cartes/mouvement-cartes.component';
import { EntrantEtat } from '../entrant-etat';
import { MESSAGE_NON_COMPARABLE } from '../list/entrant-list.component';

/** Vue Cartes des entrants : les entrants du mois regroupés par chantier, équipe, fonction ou type d'entrée. */
@Component({
  selector: 'app-entrant-cartes',
  imports: [MouvementCartesComponent],
  template: `<app-mouvement-cartes
    [lignes]="etat.lignes()"
    [chargement]="etat.chargement()"
    route="/entrants"
    libelleUnite="Entrants"
    libelleCategorie="Type d’entrée"
    [message]="etat.nonComparable() ? messageNonComparable : null"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrantCartesComponent {
  protected readonly etat = inject(EntrantEtat);
  protected readonly messageNonComparable = MESSAGE_NON_COMPARABLE;
}
