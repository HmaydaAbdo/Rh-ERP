import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';

import { CountUpDirective } from '../../../shared/directives/count-up.directive';
import { PaieAnalytique, PaieTranche } from '../models/paie.model';
import { formaterMontant, formaterPart, formaterVariation, libellePeriode } from '../paie-format';
import { PaieFiltres, lireFiltres, versCriteres, versParametres } from '../filtres/paie-filtres';
import { PaieService } from '../services/paie.service';
import { couleurGraphique, jeton } from './paie-chart-theme';

const MAX_CHANTIERS_GRAPHIQUE = 10;
const MAX_FONCTIONS_GRAPHIQUE = 7;
/** Une courbe d'évolution n'a de sens qu'à partir de trois mois. */
const MIN_MOIS_EVOLUTION = 3;
const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

interface Tuile {
  libelle: string;
  valeur: number;
  suffixe: string;
  /** Texte de comparaison au mois précédent, ou `null` quand il n'y a rien à comparer. */
  variation: string | null;
}

interface Graphique<T extends 'bar' | 'line' | 'doughnut'> {
  data: ChartData<T>;
  options: ChartOptions<T>;
}

/**
 * Vue « Analytique » de la paie : tableau de bord interactif d'un mois sur un périmètre filtré. Le périmètre est celui de la
 * barre de filtres commune (voir `filtres/paie-filtres.ts`), portée par l'URL : chaque changement relance l'analyse (la
 * demande précédente, si elle tarde, est abandonnée). Le mois est indispensable ici : sans mois, le plus récent est ouvert.
 * Aucun calcul métier ici : tout vient de `POST /paie/analytique` (voir docs/paie/README.md, « Vue Analytique »).
 */
@Component({
  selector: 'app-paie-analytique',
  standalone: true,
  imports: [CommonModule, ChartModule, CountUpDirective],
  templateUrl: './paie-analytique.component.html',
  styleUrl: './paie-analytique.component.scss'
})
export class PaieAnalytiqueComponent implements OnInit {
  private readonly paieService = inject(PaieService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly periodes = signal<string[]>([]);
  readonly periodesChargees = signal(false);
  /** Initialisés depuis l'URL courante : sans cela, un mois par défaut pourrait écraser celui de l'URL si la liste des mois arrive la première. */
  readonly filtres = signal<PaieFiltres>(lireFiltres(this.route.snapshot.queryParamMap));
  readonly donnees = signal<PaieAnalytique | null>(null);
  readonly chargement = signal(false);

  readonly libellePeriode = libellePeriode;
  readonly formaterMontant = formaterMontant;
  readonly minMoisEvolution = MIN_MOIS_EVOLUTION;

  readonly vide = computed(() => this.donnees()?.kpis.effectif === 0);
  readonly aucunePaie = computed(() => this.periodesChargees() && this.periodes().length === 0);

  readonly tuiles = computed<Tuile[]>(() => {
    const donnees = this.donnees();
    if (!donnees) {
      return [];
    }
    const { kpis, moisPrecedent } = donnees;
    const pourcent = (courant: number | null, precedent: number | null | undefined): string | null =>
      moisPrecedent && courant !== null && precedent ? formaterVariation(((courant - precedent) / precedent) * 100) : null;
    const absolu = (courant: number, precedent: number | undefined): string | null =>
      moisPrecedent && precedent !== undefined ? `${courant - precedent > 0 ? '+' : ''}${FORMAT_ENTIER.format(courant - precedent)}` : null;

    return [
      { libelle: 'Masse salariale', valeur: kpis.masse, suffixe: 'DH', variation: pourcent(kpis.masse, moisPrecedent?.masse) },
      { libelle: 'Bulletins', valeur: kpis.effectif, suffixe: '', variation: absolu(kpis.effectif, moisPrecedent?.effectif) },
      { libelle: 'Coût moyen par employé', valeur: kpis.coutMoyen ?? 0, suffixe: 'DH', variation: pourcent(kpis.coutMoyen, moisPrecedent?.coutMoyen) },
      { libelle: 'STC / sorties', valeur: kpis.stc, suffixe: '', variation: absolu(kpis.stc, moisPrecedent?.stc) },
      { libelle: 'Chantiers', valeur: kpis.nombreChantiers, suffixe: '', variation: absolu(kpis.nombreChantiers, moisPrecedent?.nombreChantiers) }
    ];
  });

  readonly chantiersAffiches = computed(() => this.donnees()?.parChantier.slice(0, MAX_CHANTIERS_GRAPHIQUE) ?? []);
  readonly chantiersMasques = computed(() => Math.max(0, (this.donnees()?.parChantier.length ?? 0) - MAX_CHANTIERS_GRAPHIQUE));
  readonly evolutionVisible = computed(() => (this.donnees()?.evolution.length ?? 0) >= MIN_MOIS_EVOLUTION);

  readonly graphiqueChantiers = computed<Graphique<'bar'>>(() => {
    const chantiers = this.chantiersAffiches();
    return {
      data: {
        labels: chantiers.map((c) => c.code),
        datasets: [{ label: 'Masse (DH)', data: chantiers.map((c) => c.masse), backgroundColor: couleurGraphique(1), borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        animation: { duration: 900 },
        onHover: (evenement, elements) => {
          const cible = evenement.native?.target as HTMLElement | null | undefined;
          if (cible) {
            cible.style.cursor = elements.length > 0 ? 'pointer' : 'default';
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (elements) => {
                const chantier = chantiers[elements[0].dataIndex];
                return chantier.libelle ? `${chantier.code} · ${chantier.libelle}` : chantier.code;
              },
              label: (element) => {
                const chantier = chantiers[element.dataIndex];
                return `${formaterMontant(chantier.masse)} DH · ${chantier.effectif} bulletins`;
              }
            }
          }
        },
        scales: this.echelles(false)
      }
    };
  });

  readonly graphiqueEvolution = computed<Graphique<'line'>>(() => {
    const evolution = this.donnees()?.evolution ?? [];
    const masse = couleurGraphique(1);
    const effectif = couleurGraphique(2);
    return {
      data: {
        labels: evolution.map((e) => libellePeriode(e.periode)),
        datasets: [
          { label: 'Masse (DH)', data: evolution.map((e) => e.masse), borderColor: masse, backgroundColor: masse, yAxisID: 'y', tension: 0.3, pointRadius: 4 },
          { label: 'Bulletins', data: evolution.map((e) => e.effectif), borderColor: effectif, backgroundColor: effectif, yAxisID: 'y1', tension: 0.3, pointRadius: 4 }
        ]
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 900 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { color: jeton('--color-text-muted') } } },
        scales: {
          x: { ticks: { color: jeton('--color-text-muted') }, grid: { display: false } },
          y: { position: 'left', ticks: { color: jeton('--color-text-muted'), callback: (v) => FORMAT_ENTIER.format(Number(v)) }, grid: { color: jeton('--color-border') } },
          y1: { position: 'right', ticks: { color: jeton('--color-text-muted') }, grid: { display: false } }
        }
      }
    };
  });

  readonly graphiqueFonctions = computed<Graphique<'doughnut'>>(() => {
    const fonctions = this.donnees()?.parFonction ?? [];
    const principales = [...fonctions].sort((a, b) => b.effectif - a.effectif).slice(0, MAX_FONCTIONS_GRAPHIQUE);
    const autres = fonctions.reduce((somme, f) => somme + f.effectif, 0) - principales.reduce((somme, f) => somme + f.effectif, 0);
    const libelles = [...principales.map((f) => f.libelle), ...(autres > 0 ? ['Autres'] : [])];
    const valeurs = [...principales.map((f) => f.effectif), ...(autres > 0 ? [autres] : [])];
    const total = valeurs.reduce((somme, v) => somme + v, 0);
    return {
      data: {
        labels: libelles,
        datasets: [{ data: valeurs, backgroundColor: valeurs.map((_, i) => couleurGraphique(i + 1)), borderColor: jeton('--color-surface'), borderWidth: 2 }]
      },
      options: {
        maintainAspectRatio: false,
        cutout: '60%',
        animation: { duration: 900 },
        plugins: {
          legend: { position: 'right', labels: { color: jeton('--color-text-muted'), boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (element) => `${element.label} : ${element.parsed} bulletins (${formaterPart((element.parsed / total) * 100)})`
            }
          }
        }
      }
    };
  });

  readonly graphiqueTranches = computed<Graphique<'bar'>>(() => {
    const tranches = this.donnees()?.tranches ?? [];
    return {
      data: {
        labels: tranches.map((t) => this.libelleTranche(t)),
        datasets: [{ label: 'Bulletins', data: tranches.map((t) => t.effectif), backgroundColor: couleurGraphique(3), borderRadius: 4 }]
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 900 },
        plugins: { legend: { display: false } },
        scales: this.echelles(true)
      }
    };
  });

  readonly qualite = computed(() => {
    const donnees = this.donnees();
    if (!donnees) {
      return [];
    }
    const effectif = donnees.kpis.effectif;
    const ligne = (libelle: string, nombre: number): { libelle: string; nombre: number; part: number } => ({
      libelle,
      nombre,
      part: effectif > 0 ? (nombre / effectif) * 100 : 0
    });
    return [ligne('Bulletins sans équipe', donnees.qualite.sansEquipe), ligne('Bulletins sans observation', donnees.qualite.sansObservation)];
  });

  readonly formaterPart = formaterPart;

  ngOnInit(): void {
    this.paieService.listerPeriodes().subscribe((periodes) => {
      this.periodes.set(periodes.map((p) => p.periode));
      this.periodesChargees.set(true);
      this.completerPeriode();
    });

    this.route.queryParamMap
      .pipe(
        tap((params) => {
          this.filtres.set(lireFiltres(params));
          this.completerPeriode();
        }),
        filter(() => this.filtres().periode !== null),
        tap(() => this.chargement.set(true)),
        switchMap(() => {
          return this.paieService.analyser(versCriteres(this.filtres())).pipe(
            tap({ next: () => this.chargement.set(false), error: () => this.chargement.set(false) }),
            catchError(() => EMPTY)
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((donnees) => this.donnees.set(donnees));
  }

  /** Le périmètre devient l'URL : c'est elle qui relance l'analyse (voir `ngOnInit`). */
  appliquer(filtres: PaieFiltres): void {
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: versParametres(filtres) });
  }

  /** Clic sur une barre du graphique des chantiers : l'analyse se resserre sur ce chantier. */
  surBarreChantier(evenement: { element?: { index?: number } }): void {
    const chantier = this.chantiersAffiches()[evenement.element?.index ?? -1];
    if (chantier) {
      this.appliquer({ ...this.filtres(), chantierIds: [chantier.id] });
    }
  }

  private libelleTranche(tranche: PaieTranche): string {
    const min = FORMAT_ENTIER.format(tranche.min);
    return tranche.max === null ? `≥ ${min}` : `${min} – ${FORMAT_ENTIER.format(tranche.max)}`;
  }

  private echelles(verticale: boolean): ChartOptions<'bar'>['scales'] {
    const texte = jeton('--color-text-muted');
    const grille = jeton('--color-border');
    return {
      x: { ticks: { color: texte, callback: verticale ? undefined : (v) => FORMAT_ENTIER.format(Number(v)) }, grid: { color: verticale ? 'transparent' : grille } },
      y: { beginAtZero: true, ticks: { color: texte }, grid: { color: verticale ? grille : 'transparent' } }
    };
  }

  /** Sans mois dans l'URL, ouvre le plus récent qui contient de la paie (remplace l'entrée d'historique : pas de retour vers une URL vide). */
  private completerPeriode(): void {
    if (this.periodesChargees() && this.filtres().periode === null && this.periodes().length > 0) {
      this.appliquer({ ...this.filtres(), periode: this.periodes()[0] });
    }
  }
}
