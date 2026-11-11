import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, Subscription } from 'rxjs';

import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent, BadgeSeverity } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { ColumnChooserComponent } from '../../../shared/ui/column-chooser/column-chooser.component';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { MonthPickerComponent } from '../../../shared/ui/month-picker/month-picker.component';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { libellePeriode, periodePrecedente, periodeSuivante } from '../../paie/paie-format';
import { Sortie, SortiesMois } from '../models/sortie.model';
import { SortieService } from '../services/sortie.service';

/** Libellé affiché pour le motif que l'API renvoie quand aucun motif n'a été saisi. */
export const LIBELLE_MOTIF_NON_PRECISE = 'Non précisé';

export function libelleMotif(motif: string): string {
  return motif === 'NON_PRECISE' ? LIBELLE_MOTIF_NON_PRECISE : motif;
}

/** Mois courant au format `aaaa-MM`, celui de l'API. */
export function moisCourant(maintenant: Date = new Date()): string {
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;
}

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
 * STC / Sortie : qui a quitté son poste le mois choisi, pourquoi, depuis quand il était là et ce qu'il touchait. C'est la
 * source de l'équipe RH pour le calcul des STC et le suivi des abandons de poste ; chaque nom ouvre la fiche de l'employé.
 * Même organisation que les autres écrans de mois : titre, barre du mois, chiffres du mois, puis le tableau (nombre de
 * lignes à gauche, choix des colonnes à droite).
 */
@Component({
  selector: 'app-sortie-page',
  imports: [
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    DecimalPipe,
    BadgeComponent,
    ButtonComponent,
    ColumnChooserComponent,
    MonthPickerComponent,
    RouterLink,
    TableComponent,
    TableCellDirective
  ],
  templateUrl: './sortie-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortiePageComponent {
  private readonly service = inject(SortieService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private requete: Subscription | null = null;

  protected readonly periode = signal(moisCourant());
  protected readonly resultat = signal<SortiesMois | null>(null);
  protected readonly chargement = signal(false);
  protected readonly panneauMoisOuvert = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
  ];

  protected readonly libelleMois = computed(() => libellePeriode(this.periode()));
  protected readonly lignes = computed<Sortie[]>(() => this.resultat()?.sorties ?? []);

  /** Les chiffres du mois : total, STC, autres motifs, montant des derniers bulletins (si la paie est lisible), ancienneté. */
  protected readonly chiffres = computed(() => {
    const resultat = this.resultat();
    if (!resultat) {
      return null;
    }
    const stc = resultat.parMotif['STC'] ?? 0;
    const autresMotifs = Object.entries(resultat.parMotif)
      .filter(([motif]) => motif !== 'STC')
      .map(([motif, nombre]) => `${libelleMotif(motif)} : ${nombre}`);
    const montants = resultat.sorties.map((s) => s.montantDernierBulletin).filter((m): m is number => m !== null && m !== undefined);
    const anciennetes = resultat.sorties.map((s) => s.ancienneteMois).filter((m): m is number => m !== null && m !== undefined);
    return {
      nombre: resultat.nombre,
      stc,
      partStc: resultat.nombre > 0 ? Math.round((stc * 100) / resultat.nombre) : 0,
      autres: resultat.nombre - stc,
      detailAutres: autresMotifs.join(', '),
      montant: montants.length > 0 ? montants.reduce((a, b) => a + b, 0) : null,
      anciennete: anciennetes.length > 0 ? Math.round(anciennetes.reduce((a, b) => a + b, 0) / anciennetes.length) : null,
      revenus: resultat.sorties.filter((s) => s.statutActuel === 'ACTIF').length
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

  constructor() {
    this.charger(this.periode());
    this.destroyRef.onDestroy(() => this.requete?.unsubscribe());
  }

  protected choisir(periode: string): void {
    this.panneauMoisOuvert.set(false);
    this.periode.set(periode);
    this.charger(periode);
  }

  protected moisPrecedent(): void {
    this.choisir(periodePrecedente(this.periode()));
  }

  protected moisSuivant(): void {
    this.choisir(periodeSuivante(this.periode()));
  }

  protected surToucheMois(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.panneauMoisOuvert.set(false);
    }
  }

  private charger(periode: string): void {
    this.requete?.unsubscribe();
    this.chargement.set(true);
    this.requete = this.service
      .sortiesDuMois(periode)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.chargement.set(false))
      )
      .subscribe({
        next: (resultat) => this.resultat.set(resultat),
        error: () => {
          this.resultat.set(null);
          this.notifications.add({ severity: 'error', summary: 'Impossible de charger les sorties du mois.' });
        }
      });
  }
}
