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
import { PaieAnalytique, PaieChantierMasse } from '../../paie/models/paie.model';
import { formaterMontant, libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import { filtreChantierActif, lireFiltresChantier, versCriteresChantier } from '../filtres/chantier-filtres';
import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';

interface LigneChantierPaie extends PaieChantierMasse {
  effectifFiches: number | null;
}

interface Graphique<T extends 'bar' | 'line'> {
  data: ChartData<T>;
  options: ChartOptions<T>;
  plugins: import('chart.js').Plugin<T>[];
}

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

@Component({
  selector: 'app-chantier-analytique',
  imports: [RouterLink, ChartComponent],
  templateUrl: './chantier-analytique.component.html',
  styleUrl: './chantier-analytique.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierAnalytiqueComponent {
  private readonly chantierService = inject(ChantierService);
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
  protected readonly chantiers = signal<Chantier[]>([]);
  protected readonly periode = signal<string | null>(null);
  protected readonly chantierId = signal<number | null>(null);
  protected readonly chantier = signal<Chantier | null>(null);
  protected readonly filtreActif = signal(false);
  protected readonly analyse = signal<PaieAnalytique | null>(null);
  protected readonly chargementPaie = signal(false);
  protected readonly effectifsFiches = signal(new Map<number, number>());
  protected readonly lignes = computed<LigneChantierPaie[]>(() => {
    const parId = new Map<number, LigneChantierPaie>();
    for (const chantier of this.chantiers()) {
      parId.set(chantier.id, {
        id: chantier.id,
        code: chantier.code,
        libelle: chantier.nom || chantier.designation,
        masse: 0,
        effectif: 0,
        stc: 0,
        stcMontant: 0,
        effectifFiches: this.effectifsFiches().get(chantier.id) ?? null
      });
    }
    for (const paie of this.analyse()?.parChantier ?? []) {
      const ligne = parId.get(paie.id);
      if (ligne) Object.assign(ligne, paie);
      else parId.set(paie.id, { ...paie, effectifFiches: this.effectifsFiches().get(paie.id) ?? null });
    }
    return [...parId.values()].sort((a, b) => a.code.localeCompare(b.code));
  });
  protected readonly aucunePaie = computed(() => this.analyse()?.kpis.effectif === 0);
  /** Un filtre est actif et aucun chantier du catalogue ne le satisfait : rien à analyser. */
  protected readonly aucunChantierFiltre = computed(() => this.filtreActif() && this.chantierId() === null && this.chantiers().length === 0);
  protected readonly perimetre = computed(() => this.chantier()?.code ?? (this.filtreActif() ? 'chantiers filtrés' : 'tous les chantiers'));
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
        chantierId: Number(params.get('chantierId')),
        periode: params.get('periode'),
        filtres: lireFiltresChantier(params)
      })),
      distinctUntilChanged((a, b) =>
        a.chantierId === b.chantierId && a.periode === b.periode
        && a.filtres.code === b.filtres.code && a.filtres.designation === b.filtres.designation && a.filtres.actif === b.filtres.actif),
      switchMap(({ chantierId, periode, filtres }) => {
        const id = Number.isInteger(chantierId) && chantierId > 0 ? chantierId : null;
        const mois = periode && PERIODE_RE.test(periode) ? periode : null;
        this.chantierId.set(id);
        this.periode.set(mois);
        this.filtreActif.set(filtreChantierActif(filtres));
        if (id !== null) this.chantierService.getById(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => this.chantier.set(c));
        else this.chantier.set(null);
        return this.chargerChantiers(filtres).pipe(map((chantiers) => ({ id, mois, chantiers })));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ id, mois, chantiers }) => {
      this.chantiers.set(chantiers);
      // Même périmètre que les autres vues : les filtres réduisent le catalogue, donc les effectifs et la Paie analysés.
      const chantierIds = id !== null ? [id] : this.filtreActif() ? chantiers.map((c) => c.id) : undefined;
      this.chargementEmployes?.unsubscribe();
      this.chargementPaieEnCours?.unsubscribe();
      if (chantierIds?.length === 0) {
        this.effectifsFiches.set(new Map());
        this.analyse.set(null);
        this.chargementPaie.set(false);
        return;
      }
      this.chargerEffectifs(chantierIds);
      if (mois && this.voitPaie()) this.chargerPaie(mois, chantierIds);
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

  private chargerChantiers(filtres: ReturnType<typeof lireFiltresChantier>): Observable<Chantier[]> {
    const taille = 200;
    const criteres = versCriteresChantier(filtres);
    return this.chantierService.search(criteres, { page: 0, size: taille, sort: 'code,asc' }).pipe(
      expand((page) => page.page.number + 1 < page.page.totalPages
        ? this.chantierService.search(criteres, { page: page.page.number + 1, size: taille, sort: 'code,asc' })
        : EMPTY),
      reduce((chantiers, page) => chantiers.concat(page.content), [] as Chantier[])
    );
  }

  protected changerPeriode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.naviguer({ periode: value || null });
  }

  protected retourVueEnsemble(): void {
    this.naviguer({ chantierId: null });
  }

  private naviguer(params: { chantierId?: number | null; periode?: string | null }): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private chargerEffectifs(chantierIds: number[] | undefined): void {
    if (!this.voitEmployes()) {
      this.effectifsFiches.set(new Map());
      return;
    }
    this.chargementEmployes = this.employeeService.regrouper({ chantierIds }, 'CHANTIER').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((groupes) => {
      this.effectifsFiches.set(new Map(groupes.filter((g) => g.id > 0).map((g) => [g.id, g.effectif])));
    });
  }

  private chargerPaie(periode: string, chantierIds: number[] | undefined): void {
    this.chargementPaie.set(true);
    this.chargementPaieEnCours = this.paieService.analyser({ periode, chantierIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((analyse) => {
        this.analyse.set(analyse);
        this.chargementPaie.set(false);
      });
  }
}
