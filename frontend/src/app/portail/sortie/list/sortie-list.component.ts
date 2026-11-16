import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent, BadgeSeverity } from '../../../shared/ui/badge/badge.component';
import { ColumnChooserComponent } from '../../../shared/ui/column-chooser/column-chooser.component';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { libellePeriode } from '../../paie/paie-format';
import { Sortie } from '../models/sortie.model';
import { libelleMotif, LIBELLE_MOTIF_NON_PRECISE, SortieEtat } from '../sortie-etat';

export { libelleMotif, LIBELLE_MOTIF_NON_PRECISE };

/** `878` -> « 73 ans 2 mois », `14` -> « 1 an 2 mois », `5` -> « 5 mois » : l'ancienneté au mois du départ. */
export function formaterAnciennete(mois: number | null | undefined): string {
  if (mois === null || mois === undefined) {
    return '—';
  }
  const annees = Math.floor(mois / 12);
  const reste = mois % 12;
  const parties = [annees > 0 ? `${annees} an${annees > 1 ? 's' : ''}` : '', reste > 0 || annees === 0 ? `${reste} mois` : ''];
  return parties.filter(Boolean).join(' ');
}

/** Couleur de la pastille de motif : le STC est l'événement de paie à traiter, les autres motifs restent neutres. */
export function severiteMotif(motif: string): BadgeSeverity {
  return motif === 'STC' ? 'warning' : motif === 'Sortie' ? 'info' : 'neutral';
}

/**
 * Vue Tabulaire des sorties (STC / Sortie) : qui a quitté son poste le mois choisi, pourquoi, depuis quand il était là et ce
 * qu'il touchait. C'est la source de l'équipe RH pour le calcul des STC et le suivi des abandons de poste ; chaque nom ouvre la
 * fiche de l'employé. Les chiffres du mois, puis le tableau (nombre de lignes à gauche, choix des colonnes à droite) ; le mois,
 * les filtres et l'export PDF sont dans la coque (`SortieVuesComponent`).
 */
@Component({
  selector: 'app-sortie-list',
  imports: [DecimalPipe, BadgeComponent, ColumnChooserComponent, RouterLink, TableComponent, TableCellDirective],
  templateUrl: './sortie-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortieListComponent {
  protected readonly etat = inject(SortieEtat);

  protected readonly libelleMois = computed(() => libellePeriode(this.etat.filtres().periode));
  protected readonly lignes = computed<Sortie[]>(() => this.etat.resultat()?.sorties ?? []);

  /** Les chiffres du mois, calculés sur les lignes affichées : total, STC, autres motifs, montant des derniers bulletins, ancienneté. */
  protected readonly chiffres = computed(() => {
    const resultat = this.etat.resultat();
    if (!resultat) {
      return null;
    }
    const sorties = resultat.sorties;
    const stc = sorties.filter((s) => s.motif === 'STC').length;
    const autresMotifs = new Map<string, number>();
    for (const sortie of sorties.filter((s) => s.motif !== 'STC')) {
      autresMotifs.set(sortie.motif, (autresMotifs.get(sortie.motif) ?? 0) + 1);
    }
    const montants = sorties.map((s) => s.montantDernierBulletin).filter((m): m is number => m !== null && m !== undefined);
    const anciennetes = sorties.map((s) => s.ancienneteMois).filter((m): m is number => m !== null && m !== undefined);
    return {
      nombre: sorties.length,
      stc,
      partStc: sorties.length > 0 ? Math.round((stc * 100) / sorties.length) : 0,
      autres: sorties.length - stc,
      detailAutres: [...autresMotifs].sort().map(([motif, nombre]) => `${libelleMotif(motif)} : ${nombre}`).join(', '),
      montant: montants.length > 0 ? montants.reduce((a, b) => a + b, 0) : null,
      anciennete: anciennetes.length > 0 ? Math.round(anciennetes.reduce((a, b) => a + b, 0) / anciennetes.length) : null,
      revenus: sorties.filter((s) => s.statutActuel === 'ACTIF').length
    };
  });

  protected readonly libelleMotif = libelleMotif;
  protected readonly severiteMotif = severiteMotif;
  protected readonly formaterAnciennete = formaterAnciennete;
  protected readonly libellePeriode = libellePeriode;

  protected readonly colonnes = new ColumnState([
    { field: 'nomPrenom', header: 'Nom et prénom', minWidth: 220, cellClass: 'font-semibold' },
    { field: 'cin', header: 'CIN', minWidth: 110 },
    { field: 'periode', header: 'Mois de sortie', shortHeader: 'Sortie', minWidth: 140 },
    { field: 'motif', header: 'Motif', minWidth: 130 },
    { field: 'fonction', header: 'Fonction', minWidth: 170 },
    { field: 'chantier', header: 'Chantier', minWidth: 120 },
    { field: 'chantierDesignation', header: 'Désignation du chantier', shortHeader: 'Désign. chantier', minWidth: 190 },
    { field: 'equipe', header: 'Équipe', minWidth: 130 },
    { field: 'dateEmbauche', header: 'Date d’embauche', shortHeader: 'Embauche', minWidth: 120 },
    { field: 'ancienneteMois', header: 'Ancienneté au départ', shortHeader: 'Ancienneté', minWidth: 130 },
    { field: 'dernierePaie', header: 'Dernier bulletin', shortHeader: 'Dern. bulletin', minWidth: 130 },
    { field: 'joursTravailles', header: 'Jours travaillés', shortHeader: 'Jours', align: 'text-center', minWidth: 90 },
    { field: 'montantDernierBulletin', header: 'Montant du dernier bulletin (DH)', shortHeader: 'Montant (DH)', align: 'text-end', cellClass: 'font-bold', minWidth: 130 },
    { field: 'salaire', header: 'Salaire de la fiche (DH)', shortHeader: 'Salaire (DH)', align: 'text-end', minWidth: 120 },
    { field: 'observation', header: 'Observation du bulletin', shortHeader: 'Obs', minWidth: 150 },
    { field: 'statutActuel', header: 'Situation actuelle', shortHeader: 'Situation', minWidth: 150 }
  ]);
}
