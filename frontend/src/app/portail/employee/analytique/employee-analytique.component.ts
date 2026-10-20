import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { combineLatest, map, switchMap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { animationGraphique, grille, infobulle, jeton, police } from '../../../shared/ui/chart/chart-theme';
import { PaieEffectifMois } from '../../paie/models/paie.model';
import { libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import { lireFiltres, versCriteres } from '../filtres/employee-filtres';
import { DimensionEmployes, EmployeeAnalytique, EmployeeRegroupement, EmployeeTranche } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';

type Graphique<T extends 'bar' | 'line'> = { data: ChartData<T>; options: ChartOptions<T> };

const LIBELLES_DIMENSIONS: Record<DimensionEmployes, string> = { CHANTIER: 'Chantier', EQUIPE: 'Équipe', FONCTION: 'Fonction' };
/** La répartition montre les plus grands groupes ; le reste est dans le tableau de données. */
const NOMBRE_BARRES = 12;
const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/**
 * Libellé d'une tranche, dans la notation retenue le 2026-10-19 : les âges en années pleines, borne haute incluse
 * (« 25-34 ans ») ; l'ancienneté de borne à borne (« 1-3 ans » : d'un an à moins de trois). Première et dernière tranches en
 * toutes lettres (« moins de 25 ans », « moins d'un an », « 55 ans et plus »).
 */
export function libelleTranche(tranche: EmployeeTranche, mesure: 'age' | 'anciennete'): string {
  if (tranche.max === null) {
    return `${tranche.min} ans et plus`;
  }
  if (tranche.min === 0) {
    return tranche.max === 1 ? 'moins d’un an' : `moins de ${tranche.max} ans`;
  }
  return `${tranche.min}-${mesure === 'age' ? tranche.max - 1 : tranche.max} ans`;
}

/**
 * Vue Analytique des employés : les chiffres clés du périmètre (filtres de la barre), la pyramide des âges, l'ancienneté, la
 * répartition par chantier, équipe ou fonction — et, pour qui a `PAIE_READ`, les mouvements mois par mois tirés de la paie
 * (employés payés, entrées, sorties, mutations). Chaque graphique a son tableau de données.
 */
@Component({
  selector: 'app-employee-analytique',
  imports: [DecimalPipe, ChartComponent],
  templateUrl: './employee-analytique.component.html',
  styleUrl: './employee-analytique.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeAnalytiqueComponent {
  private readonly employeeService = inject(EmployeeService);
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly dimensions: DimensionEmployes[] = ['CHANTIER', 'EQUIPE', 'FONCTION'];
  protected readonly libellesDimensions = LIBELLES_DIMENSIONS;
  protected readonly libelleTranche = libelleTranche;
  protected readonly libellePeriode = libellePeriode;
  protected readonly voitLaPaie = computed(() => this.authService.hasPermission('PAIE_READ'));

  private readonly filtres = toSignal(this.route.queryParamMap.pipe(map(lireFiltres)), { requireSync: true });
  protected readonly dimension = signal<DimensionEmployes>('CHANTIER');

  protected readonly analyse = signal<EmployeeAnalytique | null>(null);
  protected readonly repartition = signal<EmployeeRegroupement[]>([]);
  protected readonly mouvements = signal<PaieEffectifMois[]>([]);

  constructor() {
    const filtres$ = this.route.queryParamMap.pipe(map(lireFiltres));
    filtres$
      .pipe(switchMap((filtres) => this.employeeService.analyser(versCriteres(filtres))), takeUntilDestroyed(this.destroyRef))
      .subscribe((analyse) => this.analyse.set(analyse));
    combineLatest([filtres$, toObservable(this.dimension)])
      .pipe(
        switchMap(([filtres, dimension]) => this.employeeService.regrouper(versCriteres(filtres), dimension)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((groupes) => this.repartition.set(groupes));
    if (this.voitLaPaie()) {
      filtres$
        .pipe(
          switchMap((f) => this.paieService.effectifs({ chantierIds: f.chantierIds, fonctionIds: f.fonctionIds, equipeIds: f.equipeIds })),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe((mois) => this.mouvements.set(mois));
    }
  }

  /** Le périmètre retient-il un nom, un CIN ou un statut ? Les mouvements de la paie ne suivent pas ces filtres-là. */
  protected readonly filtresHorsPaie = computed(() => {
    const f = this.filtres();
    return !!f.nomPrenom.trim() || !!f.cin.trim() || f.statut !== null;
  });

  protected libelleGroupe(groupe: EmployeeRegroupement): string {
    return groupe.id === 0 && this.dimension() === 'EQUIPE' ? 'Sans équipe' : (groupe.code ?? groupe.libelle);
  }

  protected readonly graphiqueAges = computed(() => this.barres(this.analyse()?.parAge ?? [], 'age', '--chart-1'));
  protected readonly graphiqueAnciennete = computed(() => this.barres(this.analyse()?.parAnciennete ?? [], 'anciennete', '--chart-2'));

  protected readonly graphiqueRepartition = computed<Graphique<'bar'>>(() => {
    this.theme.theme();
    const groupes = this.repartition().slice(0, NOMBRE_BARRES);
    return {
      data: {
        labels: groupes.map((g) => this.libelleGroupe(g)),
        datasets: [
          { label: 'En poste', data: groupes.map((g) => g.actifs), backgroundColor: jeton('--chart-1'), borderRadius: 4, stack: 'effectif' },
          { label: 'Sortis', data: groupes.map((g) => g.effectif - g.actifs), backgroundColor: jeton('--chart-4'), borderRadius: 4, stack: 'effectif' }
        ]
      },
      options: this.optionsBarres({ indexAxis: 'y', empile: true, legende: true })
    };
  });

  protected readonly graphiqueEffectif = computed<Graphique<'line'>>(() => {
    this.theme.theme();
    const mois = this.mouvements();
    const couleur = jeton('--chart-1');
    return {
      data: {
        labels: mois.map((m) => libellePeriode(m.periode)),
        datasets: [
          {
            label: 'Employés payés',
            data: mois.map((m) => m.effectif),
            borderColor: couleur,
            backgroundColor: couleur,
            borderWidth: 2,
            cubicInterpolationMode: 'monotone',
            pointRadius: 4,
            pointBorderColor: jeton('--color-surface'),
            pointBorderWidth: 2
          }
        ]
      },
      options: this.optionsLigne()
    };
  });

  protected readonly graphiqueMouvements = computed<Graphique<'bar'>>(() => {
    this.theme.theme();
    const mois = this.mouvements().slice(1);
    return {
      data: {
        labels: mois.map((m) => libellePeriode(m.periode)),
        datasets: [
          { label: 'Entrées', data: mois.map((m) => m.entrees ?? 0), backgroundColor: jeton('--chart-3'), borderRadius: 4 },
          { label: 'Sorties', data: mois.map((m) => m.sorties), backgroundColor: jeton('--chart-4'), borderRadius: 4 },
          { label: 'Mutations', data: mois.map((m) => m.mutations ?? 0), backgroundColor: jeton('--chart-2'), borderRadius: 4 }
        ]
      },
      options: this.optionsBarres({ legende: true })
    };
  });

  private barres(tranches: EmployeeTranche[], mesure: 'age' | 'anciennete', couleur: string): Graphique<'bar'> {
    this.theme.theme();
    return {
      data: {
        labels: tranches.map((t) => libelleTranche(t, mesure)),
        datasets: [{ label: 'Employés', data: tranches.map((t) => t.effectif), backgroundColor: jeton(couleur), borderRadius: 4 }]
      },
      options: this.optionsBarres({})
    };
  }

  private optionsBarres(choix: { indexAxis?: 'x' | 'y'; empile?: boolean; legende?: boolean }): ChartOptions<'bar'> {
    const texte = jeton('--color-text-muted');
    const valeurs = { color: texte, font: police(), callback: (v: string | number) => FORMAT_ENTIER.format(Number(v)) };
    const categories = { color: texte, font: police(), autoSkip: true, maxRotation: 0 };
    const horizontal = choix.indexAxis === 'y';
    return {
      maintainAspectRatio: false,
      animation: animationGraphique(),
      indexAxis: choix.indexAxis ?? 'x',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: !!choix.legende, position: 'bottom', labels: { color: jeton('--color-text'), font: police(), boxWidth: 12 } },
        tooltip: { ...infobulle() }
      },
      scales: {
        x: horizontal
          ? { stacked: !!choix.empile, beginAtZero: true, ticks: valeurs, grid: grille(), border: { display: false } }
          : { stacked: !!choix.empile, ticks: categories, grid: { display: false }, border: { display: false } },
        y: horizontal
          ? { stacked: !!choix.empile, ticks: categories, grid: { display: false }, border: { display: false } }
          : { stacked: !!choix.empile, beginAtZero: true, grace: '8%', ticks: { ...valeurs, precision: 0 }, grid: grille(), border: { display: false } }
      }
    };
  }

  private optionsLigne(): ChartOptions<'line'> {
    const texte = jeton('--color-text-muted');
    return {
      maintainAspectRatio: false,
      animation: animationGraphique(),
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...infobulle() } },
      scales: {
        x: { ticks: { color: texte, font: police(), autoSkip: true, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
        y: { grace: '10%', ticks: { color: texte, font: police(), precision: 0 }, grid: grille(), border: { display: false } }
      }
    };
  }
}
