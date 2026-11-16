import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent, BadgeSeverity } from '../../../shared/ui/badge/badge.component';
import { ColumnChooserComponent } from '../../../shared/ui/column-chooser/column-chooser.component';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { SelectOption } from '../../../shared/ui/select/select.component';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { libellePeriode } from '../../paie/paie-format';
import { EntrantEtat, libelleType } from '../entrant-etat';
import { Entrant, TypeEntree } from '../models/entrant.model';

export { libelleType };

/** Options du filtre « Type » : les deux sortes d'entrée connues de l'API. */
export const OPTIONS_TYPE: SelectOption<TypeEntree>[] = [
  { value: 'NOUVELLE_EMBAUCHE', label: libelleType('NOUVELLE_EMBAUCHE') },
  { value: 'RETOUR', label: libelleType('RETOUR') }
];

export const MESSAGE_NON_COMPARABLE = 'Entrants indisponibles : ce mois ou le mois civil précédent n’a aucun bulletin de paie, on ne peut pas dire qui entre.';

/** Une nouvelle embauche est une bonne nouvelle à saluer ; un retour se lit comme une information neutre. */
export function severiteType(type: TypeEntree): BadgeSeverity {
  return type === 'NOUVELLE_EMBAUCHE' ? 'success' : 'info';
}

/**
 * Vue Tabulaire des entrants : qui est payé le mois choisi sans l'avoir été le mois civil précédent, nouvelle embauche ou
 * retour. Les chiffres du mois, puis le tableau ; le mois, les filtres et l'export PDF sont dans la coque (`EntrantVuesComponent`).
 * Quand le mois ou le mois précédent n'a aucune paie, on ne peut pas dire qui entre : l'écran l'explique au lieu de lister tout le monde.
 */
@Component({
  selector: 'app-entrant-list',
  imports: [DecimalPipe, BadgeComponent, ColumnChooserComponent, MessageComponent, RouterLink, TableComponent, TableCellDirective],
  templateUrl: './entrant-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrantListComponent {
  protected readonly etat = inject(EntrantEtat);
  protected readonly messageNonComparable = MESSAGE_NON_COMPARABLE;

  protected readonly libelleMois = computed(() => libellePeriode(this.etat.filtres().periode));
  protected readonly lignes = computed<Entrant[]>(() => this.etat.resultat()?.entrants ?? []);

  /** Les chiffres du mois, calculés sur les lignes affichées. */
  protected readonly chiffres = computed(() => {
    const resultat = this.etat.resultat();
    if (!resultat?.comparable) {
      return null;
    }
    const montants = resultat.entrants.map((e) => e.montantBulletin).filter((m): m is number => m !== null && m !== undefined);
    return {
      nombre: resultat.nombre,
      nouvelles: resultat.nouvellesEmbauches,
      retours: resultat.retours,
      chantiers: new Set(resultat.entrants.map((e) => e.chantierId)).size,
      montant: montants.length > 0 ? montants.reduce((a, b) => a + b, 0) : null
    };
  });

  protected readonly libelleType = libelleType;
  protected readonly severiteType = severiteType;
  protected readonly libellePeriode = libellePeriode;

  protected readonly colonnes = new ColumnState([
    { field: 'nomPrenom', header: 'Nom et prénom', minWidth: 220, cellClass: 'font-semibold' },
    { field: 'cin', header: 'CIN', minWidth: 110 },
    { field: 'type', header: 'Type d’entrée', shortHeader: 'Type', minWidth: 150 },
    { field: 'fonction', header: 'Fonction', minWidth: 170 },
    { field: 'chantier', header: 'Chantier', minWidth: 120 },
    { field: 'chantierDesignation', header: 'Désignation du chantier', shortHeader: 'Désign. chantier', minWidth: 190 },
    { field: 'equipe', header: 'Équipe', minWidth: 130 },
    { field: 'dateEmbauche', header: 'Date d’embauche', shortHeader: 'Embauche', minWidth: 120 },
    { field: 'chantierPrecedent', header: 'Venant de (dernier chantier)', shortHeader: 'Venant de', minWidth: 140 },
    { field: 'dernierePaiePrecedente', header: 'Dernier bulletin avant', shortHeader: 'Dern. bulletin', minWidth: 130 },
    { field: 'joursTravailles', header: 'Jours travaillés', shortHeader: 'Jours', align: 'text-center', minWidth: 90 },
    { field: 'montantBulletin', header: 'Montant du bulletin (DH)', shortHeader: 'Montant (DH)', align: 'text-end', cellClass: 'font-bold', minWidth: 130 },
    { field: 'salaire', header: 'Salaire de la fiche (DH)', shortHeader: 'Salaire (DH)', align: 'text-end', minWidth: 120 },
    { field: 'observation', header: 'Observation du bulletin', shortHeader: 'Obs', minWidth: 150 },
    { field: 'statutActuel', header: 'Situation actuelle', shortHeader: 'Situation', minWidth: 150 }
  ]);
}
