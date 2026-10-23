import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map, skip } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaieChantierMasse } from '../../paie/models/paie.model';
import { libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import { ChantierFiltres, lireFiltresChantier, memesFiltresChantier, versCriteresChantier } from '../filtres/chantier-filtres';
import { Chantier } from '../models/chantier.model';
import { libelleStatutChantier } from '../models/chantier-statut';
import { ChantierService } from '../services/chantier.service';

const TAILLE_PAGE = 12;

@Component({
  selector: 'app-chantier-cartes',
  imports: [DecimalPipe, RouterLink, BadgeComponent, ButtonComponent],
  templateUrl: './chantier-cartes.component.html',
  styleUrl: './chantier-cartes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierCartesComponent {
  private readonly chantierService = inject(ChantierService);
  private readonly employeeService = inject(EmployeeService);
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly chantiers = signal<Chantier[]>([]);
  protected readonly effectifs = signal(new Map<number, number>());
  protected readonly paieParChantier = signal(new Map<number, PaieChantierMasse>());
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly chargement = signal(true);
  protected readonly periodePaie = signal<string | null>(null);
  protected readonly voitEmployes = computed(() => this.authService.hasPermission('EMPLOYEE_READ'));
  protected readonly voitPaie = computed(() => this.authService.hasPermission('PAIE_READ'));
  protected readonly libellePeriode = libellePeriode;
  protected readonly libelleStatut = libelleStatutChantier;

  private filtres: ChantierFiltres = lireFiltresChantier(this.route.snapshot.queryParamMap);

  constructor() {
    this.route.queryParamMap
      .pipe(map(lireFiltresChantier), skip(1), distinctUntilChanged(memesFiltresChantier), takeUntilDestroyed(this.destroyRef))
      .subscribe((filtres) => {
        this.filtres = filtres;
        this.chargerPage(0);
      });
    this.chargerRelations();
    this.chargerPage(Number(this.route.snapshot.queryParamMap.get('page')) || 0);
  }

  protected changerPage(page: number): void {
    if (page < 0 || page * TAILLE_PAGE >= this.total()) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { page: page || null }, queryParamsHandling: 'merge' });
    this.chargerPage(page);
  }

  protected nombrePages(): number {
    return Math.max(1, Math.ceil(this.total() / TAILLE_PAGE));
  }

  private chargerPage(page: number): void {
    this.page.set(page);
    this.chargement.set(true);
    this.chantierService.search(versCriteresChantier(this.filtres), { page, size: TAILLE_PAGE, sort: 'code,asc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (page > 0 && page * TAILLE_PAGE >= result.page.totalElements) {
          this.changerPage(Math.max(0, Math.ceil(result.page.totalElements / TAILLE_PAGE) - 1));
          return;
        }
        this.chantiers.set(result.content);
        this.total.set(result.page.totalElements);
        this.chargement.set(false);
      });
  }

  private chargerRelations(): void {
    if (this.voitEmployes()) {
      this.employeeService.regrouper({}, 'CHANTIER').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((groupes) => {
        this.effectifs.set(new Map(groupes.filter((g) => g.id > 0).map((g) => [g.id, g.effectif])));
      });
    }
    if (this.voitPaie()) {
      this.paieService.listerPeriodes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((periodes) => {
        const periode = periodes[0]?.periode ?? null;
        this.periodePaie.set(periode);
        if (periode) {
          this.paieService.analyser({ periode }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((analyse: PaieAnalytique) => {
            this.paieParChantier.set(new Map(analyse.parChantier.map((c) => [c.id, c])));
          });
        }
      });
    }
  }
}
