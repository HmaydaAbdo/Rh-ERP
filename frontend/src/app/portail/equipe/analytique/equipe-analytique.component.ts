import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { distinctUntilChanged, EMPTY, expand, map, reduce } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { animationGraphique, grille, infobulle, jeton, police, valeursSurPoints } from '../../../shared/ui/chart/chart-theme';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaieEquipeMasse } from '../../paie/models/paie.model';
import { formaterMontant, libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';

interface LigneEquipePaie extends PaieEquipeMasse {
  effectifFiches: number | null;
}

interface Graphique<T extends 'bar' | 'line'> {
  data: ChartData<T>;
  options: ChartOptions<T>;
  plugins: import('chart.js').Plugin<T>[];
}

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

@Component({
  selector: 'app-equipe-analytique',
  imports: [RouterLink, ChartComponent],
  templateUrl: './equipe-analytique.component.html',
  styleUrl: './equipe-analytique.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeAnalytiqueComponent {
  private readonly equipeService = inject(EquipeService);
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
  protected readonly equipes = signal<Equipe[]>([]);
  protected readonly periode = signal<string | null>(null);
  protected readonly equipeId = signal<number | null>(null);
  protected readonly equipe = signal<Equipe | null>(null);
  protected readonly analyse = signal<PaieAnalytique | null>(null);
  protected readonly chargementPaie = signal(false);
  protected readonly effectifsFiches = signal(new Map<number, number>());
  protected readonly lignes = computed<LigneEquipePaie[]>(() => {
    const parId = new Map<number, LigneEquipePaie>();
    for (const equipe of this.equipes()) {
      parId.set(equipe.id, {
        id: equipe.id,
        code: equipe.code,
        libelle: equipe.libelle,
        masse: 0,
        effectif: 0,
        stc: 0,
        stcMontant: 0,
        effectifFiches: this.effectifsFiches().get(equipe.id) ?? null
      });
    }
    for (const paie of this.analyse()?.parEquipe ?? []) {
      if (paie.id !== null) {
        const ligne = parId.get(paie.id);
        if (ligne) Object.assign(ligne, paie);
        else parId.set(paie.id, { ...paie, effectifFiches: this.effectifsFiches().get(paie.id) ?? null });
      }
    }
    return [...parId.values()].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
  });
  protected readonly aucunePaie = computed(() => this.analyse()?.kpis.effectif === 0);
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

  constructor() {
    this.chargerEquipes();
    this.route.queryParamMap.pipe(
      map((params) => ({
        equipeId: Number(params.get('equipeId')),
        periode: params.get('periode')
      })),
      distinctUntilChanged((a, b) => a.equipeId === b.equipeId && a.periode === b.periode),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ equipeId, periode }) => {
      const id = Number.isInteger(equipeId) && equipeId > 0 ? equipeId : null;
      const mois = periode && PERIODE_RE.test(periode) ? periode : null;
      this.equipeId.set(id);
      this.periode.set(mois);
      if (id !== null) this.equipeService.getById(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((e) => this.equipe.set(e));
      else this.equipe.set(null);
      this.chargerDonneesCourantes();
      if (mois && this.voitPaie()) this.chargerPaie(mois, id);
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

  private chargerEquipes(): void {
    const taille = 200;
    this.equipeService.search({}, { page: 0, size: taille, sort: 'code,asc' }).pipe(
      expand((page) => page.page.number + 1 < page.page.totalPages
        ? this.equipeService.search({}, { page: page.page.number + 1, size: taille, sort: 'code,asc' })
        : EMPTY),
      reduce((equipes, page) => equipes.concat(page.content), [] as Equipe[]),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((equipes) => this.equipes.set(equipes));
  }

  protected changerPeriode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.naviguer({ periode: value || null });
  }

  protected retourVueEnsemble(): void {
    this.naviguer({ equipeId: null });
  }

  private naviguer(params: { equipeId?: number | null; periode?: string | null }): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private chargerDonneesCourantes(): void {
    if (this.voitEmployes()) {
      const equipeIds = this.equipeId() === null ? undefined : [this.equipeId()!];
      this.employeeService.regrouper({ equipeIds }, 'EQUIPE').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((groupes) => {
        this.effectifsFiches.set(new Map(groupes.filter((g) => g.id > 0).map((g) => [g.id, g.effectif])));
      });
    } else {
      this.effectifsFiches.set(new Map());
    }
  }

  private chargerPaie(periode: string, equipeId: number | null): void {
    this.chargementPaie.set(true);
    this.paieService.analyser({ periode, equipeIds: equipeId === null ? undefined : [equipeId] })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((analyse) => {
        this.analyse.set(analyse);
        this.chargementPaie.set(false);
      });
  }
}
