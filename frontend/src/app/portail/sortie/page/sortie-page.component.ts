import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, Subscription } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ColumnState } from '../../../shared/table/table-columns';
import { BadgeComponent, BadgeSeverity } from '../../../shared/ui/badge/badge.component';
import { ColumnChooserComponent } from '../../../shared/ui/column-chooser/column-chooser.component';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { SelectComponent, SelectOption } from '../../../shared/ui/select/select.component';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { telechargerFichier } from '../../../shared/utils/telecharger-fichier';
import { EmployeeFiltres } from '../../employee/filtres/employee-filtres';
import { MouvementBarreComponent } from '../../mouvement/barre/mouvement-barre.component';
import { lireMouvementFiltres, moisCourant, MouvementFiltres, versParametresMouvement, versRequete } from '../../mouvement/mouvement-filtres';
import { libellePeriode } from '../../paie/paie-format';
import { Sortie, SortiesMois } from '../models/sortie.model';
import { SortieService } from '../services/sortie.service';

/** Libellé affiché pour le motif que l'API renvoie quand aucun motif n'a été saisi. */
export const LIBELLE_MOTIF_NON_PRECISE = 'Non précisé';

export function libelleMotif(motif: string): string {
  return motif === 'NON_PRECISE' ? LIBELLE_MOTIF_NON_PRECISE : motif;
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
 * Même organisation que les autres écrans de mois : titre, barre du mois et des filtres (dans l'URL), chiffres du mois, puis
 * le tableau (nombre de lignes à gauche, choix des colonnes à droite). Le PDF exporté regroupe par chantier ce que l'écran affiche.
 */
@Component({
  selector: 'app-sortie-page',
  imports: [DecimalPipe, BadgeComponent, ColumnChooserComponent, MouvementBarreComponent, RouterLink, SelectComponent, TableComponent, TableCellDirective],
  templateUrl: './sortie-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SortiePageComponent {
  private readonly service = inject(SortieService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private requete: Subscription | null = null;

  protected readonly peutExporter = inject(AuthService).hasPermission('EMPLOYEE_EXPORT');
  protected readonly filtres = signal<MouvementFiltres>(lireMouvementFiltres(this.route.snapshot.queryParamMap, moisCourant()));
  protected readonly resultat = signal<SortiesMois | null>(null);
  protected readonly chargement = signal(false);
  protected readonly exportEnCours = signal(false);

  protected readonly libelleMois = computed(() => libellePeriode(this.filtres().periode));
  protected readonly lignes = computed<Sortie[]>(() => this.resultat()?.sorties ?? []);

  /** Les motifs proposés au filtre : ceux du périmètre (avec leur nombre) et ceux déjà choisis. */
  protected readonly optionsMotifs = computed<SelectOption<string>[]>(() => {
    const parMotif = this.resultat()?.parMotif ?? {};
    const motifs = new Set([...Object.keys(parMotif), ...this.filtres().valeurs]);
    return [...motifs].sort().map((motif) => ({ value: motif, label: parMotif[motif] ? `${libelleMotif(motif)} (${parMotif[motif]})` : libelleMotif(motif) }));
  });

  /** Les chiffres du mois, calculés sur les lignes affichées : total, STC, autres motifs, montant des derniers bulletins, ancienneté. */
  protected readonly chiffres = computed(() => {
    const resultat = this.resultat();
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

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const filtres = lireMouvementFiltres(params, moisCourant());
      this.filtres.set(filtres);
      this.charger(filtres);
    });
    this.destroyRef.onDestroy(() => this.requete?.unsubscribe());
  }

  protected choisirMois(periode: string): void {
    this.appliquer({ ...this.filtres(), periode }, false);
  }

  protected changerEmployes(employes: EmployeeFiltres): void {
    this.appliquer({ ...this.filtres(), employes });
  }

  protected changerMotifs(valeur: unknown): void {
    this.appliquer({ ...this.filtres(), valeurs: Array.isArray(valeur) ? (valeur as string[]) : [] });
  }

  /** Le mois et les filtres deviennent l'URL de l'écran ; c'est son changement qui recharge la liste. */
  private appliquer(filtres: MouvementFiltres, remplacer = true): void {
    void this.router.navigate([], { replaceUrl: remplacer, queryParams: versParametresMouvement(filtres), queryParamsHandling: 'merge' });
  }

  protected exporter(): void {
    const filtres = this.filtres();
    this.exportEnCours.set(true);
    this.service
      .exporterPdf(versRequete(filtres, 'motifs'))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.exportEnCours.set(false))
      )
      .subscribe({
        next: (pdf) => telechargerFichier(pdf, `Sortants_${filtres.periode}.pdf`),
        error: () => this.notifications.add({ severity: 'error', summary: 'Impossible de générer le PDF des sortants.' })
      });
  }

  private charger(filtres: MouvementFiltres): void {
    this.requete?.unsubscribe();
    this.chargement.set(true);
    this.requete = this.service
      .sortiesDuMois(versRequete(filtres, 'motifs'))
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
