import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { distinctUntilChanged, EMPTY, expand, map, Observable, reduce, Subscription, switchMap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { animationGraphique, grille, infobulle, jeton, police, valeursSurPoints } from '../../../shared/ui/chart/chart-theme';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaieFonctionMasse } from '../../paie/models/paie.model';
import { formaterMontant, libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import { lireFiltresFunction } from '../filtres/function-filtres';
import { Function } from '../models/function.model';
import { FunctionService } from '../services/function.service';

interface LigneFonctionPaie extends PaieFonctionMasse {
  effectifFiches: number | null;
}

interface Graphique<T extends 'bar' | 'line'> {
  data: ChartData<T>;
  options: ChartOptions<T>;
  plugins: import('chart.js').Plugin<T>[];
}

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

@Component({
  selector: 'app-function-analytique',
  imports: [RouterLink, ChartComponent],
  templateUrl: './function-analytique.component.html',
  styleUrl: './function-analytique.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunctionAnalytiqueComponent {
  private readonly functionService = inject(FunctionService);
  private readonly employeeService = inject(EmployeeService);
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly voitEmployes = computed(() => this.authService.hasPermission('EMPLOYEE_READ'));
  protected readonly voitPaie = computed(() => this.authService.hasPermission('PAIE_READ'));
  protected readonly periodes = signal<string[]>([]);
  protected readonly fonctions = signal<Function[]>([]);
  protected readonly periode = signal<string | null>(null);
  protected readonly fonctionId = signal<number | null>(null);
  protected readonly libelleFiltre = signal('');
  protected readonly fonction = signal<Function | null>(null);
  protected readonly analyse = signal<PaieAnalytique | null>(null);
  protected readonly chargementPaie = signal(false);
  protected readonly effectifsFiches = signal(new Map<number, number>());
  protected readonly lignes = computed<LigneFonctionPaie[]>(() => {
    const parId = new Map<number, LigneFonctionPaie>();
    for (const fonction of this.fonctions()) {
      parId.set(fonction.id, {
        id: fonction.id,
        libelle: fonction.libelle,
        masse: 0,
        effectif: 0,
        stc: 0,
        stcMontant: 0,
        effectifFiches: this.effectifsFiches().get(fonction.id) ?? null
      });
    }
    for (const paie of this.analyse()?.parFonction ?? []) {
      const ligne = parId.get(paie.id);
      if (ligne) Object.assign(ligne, paie);
      else parId.set(paie.id, { ...paie, effectifFiches: this.effectifsFiches().get(paie.id) ?? null });
    }
    return [...parId.values()].sort((a, b) => a.libelle.localeCompare(b.libelle));
  });
  protected readonly aucunePaie = computed(() => this.analyse()?.kpis.effectif === 0);
  /** Un filtre libellé est actif et aucune fonction du catalogue ne le satisfait : rien à analyser. */
  protected readonly aucuneFonctionFiltree = computed(() => this.libelleFiltre() !== '' && this.fonctionId() === null && this.fonctions().length === 0);
  protected readonly perimetre = computed(() => this.fonction()?.libelle ?? (this.libelleFiltre() ? 'fonctions filtrées' : 'toutes les fonctions'));
  protected readonly libellePeriode = libellePeriode;
  protected readonly formaterMontant = formaterMontant;

  protected readonly graphiqueMasse = computed<Graphique<'line'>>(() => {
    this.theme.theme();
    const evolution = this.analyse()?.evolution ?? [];
    const couleur = jeton('--chart-1');
    return {
      data: {
        labels: evolution.map((e) => libellePeriode(e.periode)),
        datasets: [{
          label: 'Masse salariale (DH)',
          data: evolution.map((e) => e.masse),
          borderColor: couleur,
          backgroundColor: couleur,
          borderWidth: 2,
          cubicInterpolationMode: 'monotone',
          pointRadius: 4,
          pointBorderColor: jeton('--color-surface'),
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: animationGraphique(),
        plugins: { legend: { display: false }, tooltip: infobulle() },
        scales: {
          x: { grid: { ...grille(), display: false }, ticks: { color: jeton('--color-text-muted'), font: police(11) } },
          y: { grid: grille(), ticks: { color: jeton('--color-text-muted'), font: police(11), callback: (v) => `${formaterMontant(Number(v))} DH` } }
        }
      },
      plugins: [valeursSurPoints((v) => `${formaterMontant(v)} DH`)]
    };
  });

  private chargementEmployes?: Subscription;
  private chargementPaieEnCours?: Subscription;

  constructor() {
    this.route.queryParamMap.pipe(
      map((params) => ({
        fonctionId: Number(params.get('fonctionId')),
        periode: params.get('periode'),
        libelle: lireFiltresFunction(params).libelle.trim()
      })),
      distinctUntilChanged((a, b) => a.fonctionId === b.fonctionId && a.periode === b.periode && a.libelle === b.libelle),
      switchMap(({ fonctionId, periode, libelle }) => {
        const id = Number.isInteger(fonctionId) && fonctionId > 0 ? fonctionId : null;
        const mois = periode && PERIODE_RE.test(periode) ? periode : null;
        this.fonctionId.set(id);
        this.periode.set(mois);
        this.libelleFiltre.set(libelle);
        if (id !== null) this.functionService.getById(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((f) => this.fonction.set(f));
        else this.fonction.set(null);
        return this.chargerFonctions(libelle).pipe(map((fonctions) => ({ id, mois, fonctions })));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ id, mois, fonctions }) => {
      this.fonctions.set(fonctions);
      // Même périmètre que les autres vues : le filtre libellé réduit le catalogue, donc les effectifs et la Paie analysés.
      const filtreActif = this.libelleFiltre() !== '';
      const fonctionIds = id !== null ? [id] : filtreActif ? fonctions.map((f) => f.id) : undefined;
      this.chargementEmployes?.unsubscribe();
      this.chargementPaieEnCours?.unsubscribe();
      if (fonctionIds?.length === 0) {
        this.effectifsFiches.set(new Map());
        this.analyse.set(null);
        this.chargementPaie.set(false);
        return;
      }
      this.chargerEffectifs(fonctionIds);
      if (mois && this.voitPaie()) this.chargerPaie(mois, fonctionIds);
      else this.analyse.set(null);
    });

    if (this.voitPaie()) {
      this.paieService.listerPeriodes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((periodes) => {
        this.periodes.set(periodes.map((p) => p.periode));
        const urlPeriode = this.route.snapshot.queryParamMap.get('periode');
        if (!urlPeriode || !PERIODE_RE.test(urlPeriode)) {
          const dernierMois = periodes[0]?.periode ?? null;
          if (dernierMois) this.naviguer({ periode: dernierMois });
        }
      });
    }
  }

  private chargerFonctions(libelle: string): Observable<Function[]> {
    const taille = 200;
    const critere = { libelle: libelle || undefined };
    return this.functionService.search(critere, { page: 0, size: taille, sort: 'libelle,asc' }).pipe(
      expand((page) => page.page.number + 1 < page.page.totalPages
        ? this.functionService.search(critere, { page: page.page.number + 1, size: taille, sort: 'libelle,asc' })
        : EMPTY),
      reduce((fonctions, page) => fonctions.concat(page.content), [] as Function[])
    );
  }

  protected changerPeriode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.naviguer({ periode: value || null });
  }

  protected retourVueEnsemble(): void {
    this.naviguer({ fonctionId: null });
  }

  private naviguer(params: { fonctionId?: number | null; periode?: string | null }): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private chargerEffectifs(fonctionIds: number[] | undefined): void {
    if (!this.voitEmployes()) {
      this.effectifsFiches.set(new Map());
      return;
    }
    this.chargementEmployes = this.employeeService.regrouper({ fonctionIds }, 'FONCTION').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((groupes) => {
      this.effectifsFiches.set(new Map(groupes.filter((g) => g.id > 0).map((g) => [g.id, g.effectif])));
    });
  }

  private chargerPaie(periode: string, fonctionIds: number[] | undefined): void {
    this.chargementPaie.set(true);
    this.chargementPaieEnCours = this.paieService.analyser({ periode, fonctionIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((analyse) => {
        this.analyse.set(analyse);
        this.chargementPaie.set(false);
      });
  }
}
