import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MouvementAnalytiqueComponent } from '../../mouvement/analytique/mouvement-analytique.component';
import { EntrantEtat } from '../entrant-etat';
import { MESSAGE_NON_COMPARABLE } from '../list/entrant-list.component';

/** Vue Analytique des entrants : répartition du mois par chantier, équipe et fonction, empilée par type d'entrée. */
@Component({
  selector: 'app-entrant-analytique',
  imports: [MouvementAnalytiqueComponent],
  template: `<app-mouvement-analytique
    [lignes]="etat.lignes()"
    [chargement]="etat.chargement()"
    libelleUnite="Entrants"
    libelleCategorie="Type d’entrée"
    [message]="etat.nonComparable() ? messageNonComparable : null"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrantAnalytiqueComponent {
  protected readonly etat = inject(EntrantEtat);
  protected readonly messageNonComparable = MESSAGE_NON_COMPARABLE;
}
