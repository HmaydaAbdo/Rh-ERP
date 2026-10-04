import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { EMPTY, catchError, filter, switchMap, tap } from 'rxjs';

import { CountUpDirective } from '../../../shared/directives/count-up.directive';
import { PaieFiltres, lireFiltres, versCriteres, versParametres } from '../filtres/paie-filtres';
import { PaieAnalytique, PaieTranche } from '../models/paie.model';
import { formaterMontant, formaterPart, formaterVariation, libellePeriode } from '../paie-format';
import { PaieService } from '../services/paie.service';
import { couleurGraphique, jeton } from './paie-chart-theme';

const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
/** Hauteur d'une ligne de barre horizontale, en rem : le graphique grandit avec le nombre de catégories, aucune n'est omise. */
const HAUTEUR_LIGNE_REM = 1.75;
const HAUTEUR_MIN_REM = 12;

/** Ce que mesurent les barres d'un graphique de répartition. */
export type Mesure = 'masse' | 'effectif';

interface Tuile {
  libelle: string;
  valeur: number;
  suffixe: string;
  /** Texte de comparaison au mois précédent, ou `null` quand il n'y a rien à comparer. */
  variation: string | null;
}

interface Graphique<T extends 'bar' | 'line'> {
  data: ChartData<T>;
  options: ChartOptions<T>;
}

/** Les éléments du plus grand au plus petit selon la mesure choisie — tous, jamais une sélection. */
function trierParMesure<T extends { masse: number; effectif: number }>(elements: T[], mesure: Mesure): T[] {
  return [...elements].sort((a, b) => b[mesure] - a[mesure]);
}

function hauteurPourLignes(lignes: number): number {
  return Math.max(HAUTEUR_MIN_REM, lignes * HAUTEUR_LIGNE_REM);
}

/**
 * Vue « Analytique » de la paie : tableau de bord interactif d'un mois sur un périmètre filtré. Le périmètre est celui de la
 * barre de filtres commune (voir `filtres/paie-filtres.ts`), portée par l'URL : chaque changement relance l'analyse (la
 * demande précédente, si elle tarde, est abandonnée). Le mois est indispensable ici : sans mois, le plus récent est ouvert.
 * **Exhaustive** : chaque graphique montre tous les chantiers, toutes les fonctions, tous les mois — jamais un palmarès tronqué.
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

  readonly mesureChantiers = signal<Mesure>('masse');
  readonly mesureFonctions = signal<Mesure>('masse');

  readonly libellePeriode = libellePeriode;
  readonly formaterMontant = formaterMontant;
  readonly formaterPart = formaterPart;

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

  readonly chantiersTries = computed(() => trierParMesure(this.donnees()?.parChantier ?? [], this.mesureChantiers()));
  readonly fonctionsTriees = computed(() => trierParMesure(this.donnees()?.parFonction ?? [], this.mesureFonctions()));
  readonly hauteurChantiers = computed(() => hauteurPourLignes(this.chantiersTries().length));
  readonly hauteurFonctions = computed(() => hauteurPourLignes(this.fonctionsTriees().length));

  readonly graphiqueChantiers = computed<Graphique<'bar'>>(() => {
    const chantiers = this.chantiersTries();
    const mesure = this.mesureChantiers();
    return {
      data: {
        labels: chantiers.map((c) => c.code),
        datasets: [
          {
            label: mesure === 'masse' ? 'Masse (DH)' : 'Bulletins',
            data: chantiers.map((c) => c[mesure]),
            backgroundColor: couleurGraphique(mesure === 'masse' ? 1 : 2),
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        animation: { duration: 900 },
        onHover: this.curseurSurBarre,
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
                return [
                  `Masse : ${formaterMontant(chantier.masse)} DH`,
                  `Bulletins : ${chantier.effectif}`,
                  `STC / sorties : ${chantier.stc}`
                ];
              }
            }
          }
        },
        scales: this.echellesHorizontales()
      }
    };
  });

  readonly graphiqueFonctions = computed<Graphique<'bar'>>(() => {
    const fonctions = this.fonctionsTriees();
    const mesure = this.mesureFonctions();
    return {
      data: {
        labels: fonctions.map((f) => f.libelle),
        datasets: [
          {
            label: mesure === 'masse' ? 'Masse (DH)' : 'Bulletins',
            data: fonctions.map((f) => f[mesure]),
            backgroundColor: couleurGraphique(mesure === 'masse' ? 5 : 6),
            borderRadius: 4
          }
        ]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        animation: { duration: 900 },
        onHover: this.curseurSurBarre,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (element) => {
                const fonction = fonctions[element.dataIndex];
                return [`Masse : ${formaterMontant(fonction.masse)} DH`, `Bulletins : ${fonction.effectif}`];
              }
            }
          }
        },
        scales: this.echellesHorizontales()
      }
    };
  });

  /** Tous les mois qui ont de la paie sur le périmètre, du plus ancien au plus récent ; le mois analysé est mis en évidence. */
  readonly graphiqueEvolution = computed<Graphique<'line'>>(() => {
    const donnees = this.donnees();
    const evolution = donnees?.evolution ?? [];
    const masse = couleurGraphique(1);
    const effectif = couleurGraphique(2);
    const rayons = evolution.map((e) => (e.periode === donnees?.periode ? 8 : 4));
    return {
      data: {
        labels: evolution.map((e) => libellePeriode(e.periode)),
        datasets: [
          { label: 'Masse (DH)', data: evolution.map((e) => e.masse), borderColor: masse, backgroundColor: masse, yAxisID: 'y', tension: 0.3, pointRadius: rayons },
          { label: 'Bulletins', data: evolution.map((e) => e.effectif), borderColor: effectif, backgroundColor: effectif, yAxisID: 'y1', tension: 0.3, pointRadius: rayons }
        ]
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 900 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { color: jeton('--color-text-muted') } } },
        scales: {
          x: { ticks: { color: jeton('--color-text-muted'), autoSkip: false }, grid: { display: false } },
          y: { position: 'left', ticks: { color: jeton('--color-text-muted'), callback: (v) => FORMAT_ENTIER.format(Number(v)) }, grid: { color: jeton('--color-border') } },
          y1: { position: 'right', ticks: { color: jeton('--color-text-muted') }, grid: { display: false } }
        }
      }
    };
  });

  readonly graphiqueTranches = computed<Graphique<'bar'>>(() => {
    const tranches = this.donnees()?.tranches ?? [];
    const texte = jeton('--color-text-muted');
    return {
      data: {
        labels: tranches.map((t) => this.libelleTranche(t)),
        datasets: [{ label: 'Bulletins', data: tranches.map((t) => t.effectif), backgroundColor: couleurGraphique(3), borderRadius: 4 }]
      },
      options: {
        maintainAspectRatio: false,
        animation: { duration: 900 },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: texte, autoSkip: false }, grid: { color: 'transparent' } },
          y: { beginAtZero: true, ticks: { color: texte }, grid: { color: jeton('--color-border') } }
        }
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
        switchMap(() =>
          this.paieService.analyser(versCriteres(this.filtres())).pipe(
            tap({ next: () => this.chargement.set(false), error: () => this.chargement.set(false) }),
            catchError(() => EMPTY)
          )
        ),
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
    const chantier = this.chantiersTries()[evenement.element?.index ?? -1];
    if (chantier) {
      this.appliquer({ ...this.filtres(), chantierIds: [chantier.id] });
    }
  }

  /** Clic sur une barre du graphique des fonctions : l'analyse se resserre sur cette fonction. */
  surBarreFonction(evenement: { element?: { index?: number } }): void {
    const fonction = this.fonctionsTriees()[evenement.element?.index ?? -1];
    if (fonction) {
      this.appliquer({ ...this.filtres(), fonctionIds: [fonction.id] });
    }
  }

  private readonly curseurSurBarre: ChartOptions<'bar'>['onHover'] = (evenement, elements) => {
    const cible = evenement.native?.target as HTMLElement | null | undefined;
    if (cible) {
      cible.style.cursor = elements.length > 0 ? 'pointer' : 'default';
    }
  };

  private libelleTranche(tranche: PaieTranche): string {
    const min = FORMAT_ENTIER.format(tranche.min);
    return tranche.max === null ? `≥ ${min}` : `${min} – ${FORMAT_ENTIER.format(tranche.max)}`;
  }

  /** Barres horizontales : une ligne par catégorie, et **toutes** les étiquettes affichées (sans quoi Chart.js en sauterait). */
  private echellesHorizontales(): ChartOptions<'bar'>['scales'] {
    const texte = jeton('--color-text-muted');
    return {
      x: { beginAtZero: true, ticks: { color: texte, callback: (v) => FORMAT_ENTIER.format(Number(v)) }, grid: { color: jeton('--color-border') } },
      y: { ticks: { color: texte, autoSkip: false }, grid: { color: 'transparent' } }
    };
  }

  /** Sans mois dans l'URL, ouvre le plus récent qui contient de la paie (remplace l'entrée d'historique : pas de retour vers une URL vide). */
  private completerPeriode(): void {
    if (this.periodesChargees() && this.filtres().periode === null && this.periodes().length > 0) {
      this.appliquer({ ...this.filtres(), periode: this.periodes()[0] });
    }
  }
}
