import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type { ChartData } from 'chart.js';
import { catchError, combineLatest, distinctUntilChanged, map, of, shareReplay, switchMap } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { PdfExportButtonComponent } from '../../../shared/components/pdf-export-button/pdf-export-button.component';
import { PdfImpressionDocument } from '../../../shared/services/pdf-impression.service';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { jeton } from '../../../shared/ui/chart/chart-theme';
import { PaieAnalytique } from '../../paie/models/paie.model';
import { libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import { criterePaieDe, lirePerimetre, porteeDe } from '../../perimetre/perimetre';
import { optionsBarres } from '../../perimetre/analytique/graphiques-perimetre';

interface ResumeQualite {
  periode: string;
  analyse: PaieAnalytique;
}

/** Indicateur commun aux trois vues Équipe, alimenté par les bulletins du dernier mois enregistré. */
@Component({
  selector: 'app-equipe-qualite',
  imports: [ChartComponent, PdfExportButtonComponent],
  templateUrl: './equipe-qualite.component.html',
  styleUrl: './equipe-qualite.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeQualiteComponent {
  private readonly paie = inject(PaieService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly resume = signal<ResumeQualite | null>(null);
  protected readonly libellePeriode = libellePeriode;
  protected readonly compteOrphelins = computed(() => this.resume()?.analyse.qualite.sansEquipe ?? 0);
  protected readonly bulletinsRattaches = computed(() => {
    const resume = this.resume();
    return resume ? Math.max(0, resume.analyse.kpis.effectif - resume.analyse.qualite.sansEquipe) : 0;
  });
  protected readonly graphique = computed<ChartData<'bar'>>(() => {
    this.theme.theme();
    return {
      labels: ['Bulletins du mois'],
      datasets: [
        { label: 'Avec équipe', data: [this.bulletinsRattaches()], backgroundColor: jeton('--color-primary'), borderRadius: 4 },
        { label: 'Orphelins', data: [this.compteOrphelins()], backgroundColor: jeton('--color-danger'), borderRadius: 4 }
      ]
    };
  });
  protected readonly options = computed(() => {
    this.theme.theme();
    return optionsBarres({ indexAxis: 'y', empile: true, legende: true });
  });
  protected readonly document = computed<PdfImpressionDocument>(() => {
    const resume = this.resume();
    return {
      titre: 'Qualité du rattachement des bulletins de paie',
      contexte: resume ? `Équipe · Paie de ${libellePeriode(resume.periode)}` : 'Équipe',
      colonnes: ['Rattachement', 'Bulletins'],
      lignes: [['Avec équipe', this.bulletinsRattaches()], ['Orphelins', this.compteOrphelins()]]
    };
  });

  constructor() {
    if (!this.auth.hasPermission('PAIE_READ')) {
      return;
    }

    const periode$ = this.paie.listerPeriodes().pipe(
      map((periodes) => periodes[0]?.periode ?? null),
      catchError(() => of(null)),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    combineLatest([periode$, this.route.queryParamMap]).pipe(
      map(([periode, params]) => ({ periode, criteres: criterePaieDe(porteeDe(lirePerimetre(params)), periode) })),
      distinctUntilChanged((a, b) => a.periode === b.periode && JSON.stringify(a.criteres) === JSON.stringify(b.criteres)),
      switchMap(({ periode, criteres }) => periode
        ? this.paie.analyser(criteres).pipe(map((analyse) => ({ periode, analyse })), catchError(() => of(null)))
        : of(null)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((resume) => this.resume.set(resume));
  }
}
