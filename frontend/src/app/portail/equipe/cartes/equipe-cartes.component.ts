import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map, skip } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaieEquipeMasse } from '../../paie/models/paie.model';
import { libellePeriode } from '../../paie/paie-format';
import { PaieService } from '../../paie/services/paie.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';
import { EquipeFiltres, lireFiltresEquipe, memesFiltresEquipe } from '../filtres/equipe-filtres';

const TAILLE_PAGE = 12;

@Component({
  selector: 'app-equipe-cartes',
  imports: [DecimalPipe, RouterLink, ButtonComponent],
  templateUrl: './equipe-cartes.component.html',
  styleUrl: './equipe-cartes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeCartesComponent {
  private readonly equipeService = inject(EquipeService);
  private readonly employeeService = inject(EmployeeService);
  private readonly paieService = inject(PaieService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly equipes = signal<Equipe[]>([]);
  protected readonly effectifs = signal(new Map<number, number>());
  protected readonly paieParEquipe = signal(new Map<number, PaieEquipeMasse>());
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly chargement = signal(true);
  protected readonly periodePaie = signal<string | null>(null);
  protected readonly voitEmployes = computed(() => this.authService.hasPermission('EMPLOYEE_READ'));
  protected readonly voitPaie = computed(() => this.authService.hasPermission('PAIE_READ'));
  protected readonly libellePeriode = libellePeriode;

  private filtres: EquipeFiltres = lireFiltresEquipe(this.route.snapshot.queryParamMap);

  constructor() {
    const params$ = this.route.queryParamMap;
    params$.pipe(map(lireFiltresEquipe), skip(1), distinctUntilChanged(memesFiltresEquipe), takeUntilDestroyed(this.destroyRef))
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
    this.equipeService.search(this.filtres, { page, size: TAILLE_PAGE, sort: 'code,asc' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (page > 0 && page * TAILLE_PAGE >= result.page.totalElements) {
          this.changerPage(Math.max(0, Math.ceil(result.page.totalElements / TAILLE_PAGE) - 1));
          return;
        }
        this.equipes.set(result.content);
        this.total.set(result.page.totalElements);
        this.chargement.set(false);
      });
  }

  private chargerRelations(): void {
    if (this.voitEmployes()) {
      this.employeeService.regrouper({}, 'EQUIPE').pipe(takeUntilDestroyed(this.destroyRef)).subscribe((groupes) => {
        this.effectifs.set(new Map(groupes.filter((g) => g.id > 0).map((g) => [g.id, g.effectif])));
      });
    }
    if (this.voitPaie()) {
      this.paieService.listerPeriodes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((periodes) => {
        const periode = periodes[0]?.periode ?? null;
        this.periodePaie.set(periode);
        if (periode) {
          this.paieService.analyser({ periode }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((analyse: PaieAnalytique) => {
            this.paieParEquipe.set(new Map(analyse.parEquipe.filter((e) => e.id !== null).map((e) => [e.id!, e])));
          });
        }
      });
    }
  }
}
