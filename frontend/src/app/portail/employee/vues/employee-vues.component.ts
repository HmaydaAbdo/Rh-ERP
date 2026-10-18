import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { EmployeeActionsComponent } from '../actions/employee-actions.component';
import { AUCUN_FILTRE, EmployeeFiltres, lireFiltres, versParametres } from '../filtres/employee-filtres';
import { EmployeeFiltresComponent } from '../filtres/employee-filtres.component';

/**
 * Coque des vues des employés : le titre, les actions (Importer, Nouvel employé) et la barre de filtres, une seule fois pour
 * toutes les vues. Les filtres sont dans l'URL (voir `filtres/employee-filtres.ts`) : la barre les écrit, chaque vue les lit —
 * ce composant ne garde aucun état partagé de plus. Les écrans de saisie et de consultation (`/employees/new`,
 * `/employees/:id`…) ne passent pas par lui.
 */
@Component({
  selector: 'app-employee-vues',
  imports: [RouterOutlet, EmployeeActionsComponent, EmployeeFiltresComponent],
  template: `
    <div class="app-page">
      <div class="app-page__header">
        <h1>Employés</h1>
        <app-employee-actions (importe)="rafraichirVue()"></app-employee-actions>
      </div>

      <app-employee-filtres [value]="filtres()" (valueChange)="appliquer($event)"></app-employee-filtres>

      @if (vueAffichee()) {
        <router-outlet></router-outlet>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeVuesComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filtres = signal<EmployeeFiltres>(AUCUN_FILTRE);
  /** Faux le temps d'un tour d'écran pour recréer la vue affichée (voir `rafraichirVue`). */
  protected readonly vueAffichee = signal(true);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.filtres.set(lireFiltres(params)));
  }

  /** Les filtres deviennent l'URL de la vue courante (sans empiler l'historique à chaque saisie) ; ce sont les vues qui réagissent. */
  protected appliquer(filtres: EmployeeFiltres): void {
    void this.router.navigate([], { replaceUrl: true, queryParams: versParametres(filtres) });
  }

  /** Après un import : la vue affichée est recréée, elle recharge donc ses données sans avoir à écouter l'import. */
  protected rafraichirVue(): void {
    this.vueAffichee.set(false);
    setTimeout(() => this.vueAffichee.set(true));
  }
}
