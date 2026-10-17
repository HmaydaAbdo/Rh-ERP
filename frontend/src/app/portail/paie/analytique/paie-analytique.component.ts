import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { catchError, EMPTY, filter, switchMap, tap } from 'rxjs';

import { ThemeService } from '../../../core/theme/theme.service';
import { CountUpDirective } from '../../../shared/directives/count-up.directive';
import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState } from '../../../shared/table/table-columns';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { lireFiltres, PaieFiltres, versCriteres, versParametres } from '../filtres/paie-filtres';
import { PaieAnalytique, PaieTranche } from '../models/paie.model';
import { formaterMontant, formaterPart, formaterVariation, libellePeriode } from '../paie-format';
import { PaieService } from '../services/paie.service';
import { animationGraphique, couleurMesure, grille, infobulle, jeton, libelleMesure, MesureGraphique, police, valeursSurPoints } from './paie-chart-theme';

const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
/** Hauteur d'une ligne de barre horizontale, en rem : le graphique grandit avec le nombre de catégories visibles. */
const HAUTEUR_LIGNE_REM = 1.75;
const HAUTEUR_MIN_REM = 12;

/** Ce que mesurent les barres d'un graphique de répartition. */
export type Mesure = MesureGraphique;

/** Les graphiques dont les données peuvent s'afficher sous forme de tableau (alternative accessible au dessin). */
export type GraphiqueAvecTableau = 'evolution' | 'tranches' | 'chantiers' | 'fonctions';

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
  plugins?: import('chart.js').Plugin<T>[];
}

/** Les éléments strictement positifs pour la mesure choisie, du plus grand au plus petit. */
function trierParMesure<T extends { masse: number; effectif: number }>(elements: T[], mesure: Mesure): T[] {
  return elements.filter((element) => element[mesure] > 0).sort((a, b) => b[mesure] - a[mesure]);
}

function hauteurPourLignes(lignes: number): number {
  return Math.max(HAUTEUR_MIN_REM, lignes * HAUTEUR_LIGNE_REM);
}

/**
 * Vue « Analytique » de la paie : tableau de bord interactif d'un mois sur un périmètre filtré. Le périmètre est celui de la
 * barre de filtres commune (voir `filtres/paie-filtres.ts`), portée par l'URL : chaque changement relance l'analyse (la
 * demande précédente, si elle tarde, est abandonnée). Le mois est indispensable ici : sans mois, le plus récent est ouvert.
 * Les répartitions conservent uniquement les catégories dont la mesure choisie est strictement positive ; les mois d'évolution
 * restent exhaustifs. Aucun calcul métier ici : tout vient de `POST /paie/analytique` (voir docs/paie/README.md, « Vue Analytique »).
 */
@Component({
  selector: 'app-paie-analytique',
  imports: [CountUpDirective, ChartComponent, IconComponent, ColumnChooserComponent, TableComponent, TableCellDirective],
  templateUrl: './paie-analytique.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './paie-analytique.component.scss'
})
export class PaieAnalytiqueComponent {
  private readonly paieService = inject(PaieService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);

  readonly periodes = signal<string[]>([]);
  readonly periodesChargees = signal(false);
  /** Initialisés depuis l'URL courante : sans cela, un mois par défaut pourrait écraser celui de l'URL si la liste des mois arrive la première. */
  readonly filtres = signal<PaieFiltres>(lireFiltres(this.route.snapshot.queryParamMap));
  readonly donnees = signal<PaieAnalytique | null>(null);
  readonly chargement = signal(false);

  readonly mesureEvolution = signal<Mesure>('masse');
  readonly mesureChantiers = signal<Mesure>('masse');
  readonly mesureFonctions = signal<Mesure>('masse');

  /** Le tableau des données d'un graphique, replié par défaut : le dessin d'abord, le détail à la demande. */
  readonly tableaux = signal<Record<GraphiqueAvecTableau, boolean>>({ evolution: false, tranches: false, chantiers: false, fonctions: false });

  readonly colonnesEvolution = new ColumnState([
    { field: 'mois', header: 'Mois' },
    { field: 'masse', header: 'Masse (DH)', align: 'text-right' },
    { field: 'effectif', header: 'Bulletins', align: 'text-right' }
  ]);
  readonly colonnesTranches = new ColumnState([
    { field: 'tranche', header: 'Tranche (DH)' },
    { field: 'effectif', header: 'Bulletins', align: 'text-right' }
  ]);
  readonly colonnesChantiers = new ColumnState([
    { field: 'chantier', header: 'Chantier' },
    { field: 'masse', header: 'Masse (DH)', align: 'text-right' },
    { field: 'effectif', header: 'Bulletins', align: 'text-right' },
    { field: 'stc', header: 'STC / sorties', align: 'text-right' }
  ]);
  readonly colonnesFonctions = new ColumnState([
    { field: 'fonction', header: 'Fonction' },
    { field: 'masse', header: 'Masse (DH)', align: 'text-right' },
    { field: 'effectif', header: 'Bulletins', align: 'text-right' }
  ]);

  readonly libellePeriode = libellePeriode;
  readonly libelleMesure = libelleMesure;
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
    this.theme.theme();
    const chantiers = this.chantiersTries();
    const mesure = this.mesureChantiers();
    return {
      data: {
        labels: chantiers.map((c) => c.code),
        datasets: [this.jeuDeBarres(libelleMesure(mesure), chantiers.map((c) => c[mesure]), couleurMesure(mesure), 'horizontal')]
      },
      options: {
        ...this.optionsBarresHorizontales(),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...infobulle(),
            callbacks: {
              title: (elements) => {
                const chantier = chantiers[elements[0].dataIndex];
                return chantier.libelle ? `${chantier.code} · ${chantier.libelle}` : chantier.code;
              },
              label: (element) => {
                const chantier = chantiers[element.dataIndex];
                return [`Masse : ${formaterMontant(chantier.masse)} DH`, `Bulletins : ${chantier.effectif}`, `STC / sorties : ${chantier.stc}`];
              }
            }
          }
        }
      }
    };
  });

  readonly graphiqueFonctions = computed<Graphique<'bar'>>(() => {
    this.theme.theme();
    const fonctions = this.fonctionsTriees();
    const mesure = this.mesureFonctions();
    return {
      data: {
        labels: fonctions.map((f) => f.libelle),
        datasets: [this.jeuDeBarres(libelleMesure(mesure), fonctions.map((f) => f[mesure]), couleurMesure(mesure), 'horizontal')]
      },
      options: {
        ...this.optionsBarresHorizontales(),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...infobulle(),
            callbacks: {
              label: (element) => {
                const fonction = fonctions[element.dataIndex];
                return [`Masse : ${formaterMontant(fonction.masse)} DH`, `Bulletins : ${fonction.effectif}`];
              }
            }
          }
        }
      }
    };
  });

  /**
   * Tous les mois qui ont de la paie sur le périmètre, du plus ancien au plus récent ; le mois analysé est mis en évidence
   * (grand repère cerclé de la couleur de la carte). **Une seule mesure, un seul axe** : la masse et les bulletins n'ont pas la
   * même échelle, ils ne partagent jamais un graphique — l'utilisateur choisit celle qu'il lit.
   */
  readonly graphiqueEvolution = computed<Graphique<'line'>>(() => {
    this.theme.theme();
    const donnees = this.donnees();
    const evolution = donnees?.evolution ?? [];
    const mesure = this.mesureEvolution();
    const couleur = couleurMesure(mesure);
    const rayons = evolution.map((e) => (e.periode === donnees?.periode ? 8 : 4));
    const texte = jeton('--color-text-muted');
    return {
      data: {
        labels: evolution.map((e) => libellePeriode(e.periode)),
        datasets: [
          {
            label: libelleMesure(mesure),
            data: evolution.map((e) => e[mesure]),
            borderColor: couleur,
            backgroundColor: couleur,
            borderWidth: 2,
            tension: 0.25,
            pointRadius: rayons,
            pointHoverRadius: 9,
            pointBorderColor: jeton('--color-surface'),
            pointBorderWidth: 2
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        animation: animationGraphique(),
        // Marge autour du tracé : le repère du mois analysé (8 px + cercle) ne doit jamais être rogné par le bord du graphique
        layout: { padding: { left: 14, right: 14, top: 10, bottom: 2 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...infobulle(),
            callbacks: {
              label: (element) => `${libelleMesure(mesure)} : ${mesure === 'masse' ? formaterMontant(Number(element.parsed.y)) : element.parsed.y}`
            }
          }
        },
        scales: {
          x: { ticks: { color: texte, font: police(), autoSkip: true, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
          y: {
            grace: '8%',
            ticks: { color: texte, font: police(), callback: (v) => FORMAT_ENTIER.format(Number(v)) },
            grid: grille(),
            border: { display: false }
          }
        }
      },
      plugins: [valeursSurPoints()]
    };
  });

  readonly graphiqueTranches = computed<Graphique<'bar'>>(() => {
    this.theme.theme();
    const tranches = this.donnees()?.tranches ?? [];
    const texte = jeton('--color-text-muted');
    return {
      data: {
        // Une étiquette sur deux lignes (« 12 000 – » / « 15 000 ») : elles tiennent à l'horizontale, sans rotation
        labels: tranches.map((t) => this.libelleTranche(t).split(' – ').map((partie, i, parties) => (i < parties.length - 1 ? `${partie} –` : partie))),
        datasets: [this.jeuDeBarres('Bulletins', tranches.map((t) => t.effectif), couleurMesure('effectif'), 'vertical')]
      },
      options: {
        maintainAspectRatio: false,
        animation: animationGraphique(),
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...infobulle(),
            callbacks: { title: (elements) => `Total ${this.libelleTranche(tranches[elements[0].dataIndex])} DH`, label: (element) => `Bulletins : ${element.parsed.y}` }
          }
        },
        scales: {
          x: { ticks: { color: texte, font: police(), autoSkip: false }, grid: { display: false }, border: { display: false } },
          y: { beginAtZero: true, ticks: { color: texte, font: police() }, grid: grille(), border: { display: false } }
        }
      }
    };
  });

  /** Les lignes des tableaux de données : l'alternative accessible au dessin, deux mesures côte à côte (un tableau n'a pas d'échelle). */
  readonly lignesEvolution = computed(() => (this.donnees()?.evolution ?? []).map((e) => ({ mois: libellePeriode(e.periode), masse: e.masse, effectif: e.effectif })));
  readonly lignesTranches = computed(() => (this.donnees()?.tranches ?? []).map((t) => ({ tranche: this.libelleTranche(t), effectif: t.effectif })));

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

  constructor() {
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

  /** Bascule l'affichage du tableau de données d'un graphique. */
  basculerTableau(graphique: GraphiqueAvecTableau): void {
    this.tableaux.update((etat) => ({ ...etat, [graphique]: !etat[graphique] }));
  }

  /** Le périmètre devient l'URL : c'est elle qui relance l'analyse (voir le constructeur). */
  appliquer(filtres: PaieFiltres): void {
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: versParametres(filtres) });
  }

  /** Clic sur une barre du graphique des chantiers : l'analyse se resserre sur ce chantier. */
  surBarreChantier(evenement: { index?: number }): void {
    const chantier = this.chantiersTries()[evenement.index ?? -1];
    if (chantier) {
      this.appliquer({ ...this.filtres(), chantierIds: [chantier.id] });
    }
  }

  /** Clic sur une barre du graphique des fonctions : l'analyse se resserre sur cette fonction. */
  surBarreFonction(evenement: { index?: number }): void {
    const fonction = this.fonctionsTriees()[evenement.index ?? -1];
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

  /** Une série de barres fine, au bout arrondi (4 px) et ancrée sur la ligne de base ; jamais d'ombre ni de contour. */
  private jeuDeBarres(label: string, data: number[], couleur: string, sens: 'horizontal' | 'vertical') {
    return {
      label,
      data,
      backgroundColor: couleur,
      borderRadius: sens === 'horizontal' ? { topRight: 4, bottomRight: 4 } : { topLeft: 4, topRight: 4 },
      borderSkipped: sens === 'horizontal' ? ('start' as const) : ('bottom' as const),
      maxBarThickness: sens === 'horizontal' ? 18 : 56,
      categoryPercentage: 0.82
    };
  }

  /** Barres horizontales : une ligne par catégorie, **toutes** les étiquettes affichées (sans quoi Chart.js en sauterait) ; survoler
   * la ligne entière suffit à voir l'infobulle. */
  private optionsBarresHorizontales(): Pick<ChartOptions<'bar'>, 'indexAxis' | 'maintainAspectRatio' | 'animation' | 'interaction' | 'onHover' | 'scales'> {
    const texte = jeton('--color-text-muted');
    return {
      indexAxis: 'y',
      maintainAspectRatio: false,
      animation: animationGraphique(),
      interaction: { mode: 'nearest', axis: 'y', intersect: false },
      onHover: this.curseurSurBarre,
      scales: {
        x: { beginAtZero: true, ticks: { color: texte, font: police(), callback: (v) => FORMAT_ENTIER.format(Number(v)) }, grid: grille(), border: { display: false } },
        y: { ticks: { color: texte, font: police(), autoSkip: false }, grid: { display: false }, border: { display: false } }
      }
    };
  }

  /** Sans mois dans l'URL, ouvre le plus récent qui contient de la paie (remplace l'entrée d'historique : pas de retour vers une URL vide). */
  private completerPeriode(): void {
    if (this.periodesChargees() && this.filtres().periode === null && this.periodes().length > 0) {
      this.appliquer({ ...this.filtres(), periode: this.periodes()[0] });
    }
  }
}
