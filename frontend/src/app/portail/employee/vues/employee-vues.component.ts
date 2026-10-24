import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { CollectionShellComponent, CollectionShellConfig } from '../../../shared/components/collection-shell/collection-shell.component';
import { EmployeeActionsComponent } from '../actions/employee-actions.component';
import { AUCUN_FILTRE, EmployeeFiltres, lireFiltres, versParametres } from '../filtres/employee-filtres';
import { EmployeeFiltresComponent } from '../filtres/employee-filtres.component';

/** Les trois vues des employés, dans l'ordre des onglets (voir `employee.routes.ts`). */
const CONFIGURATION_EMPLOYES: CollectionShellConfig = {
  titre: 'Employés',
  libelleVue: 'Vue des employés',
  vues: [
    { libelle: 'Tabulaire', icone: 'table', lien: '/employees' },
    { libelle: 'Cartes', icone: 'layout-grid', lien: '/employees/cartes' },
    { libelle: 'Analytique', icone: 'chart-column', lien: '/employees/analytique' }
  ]
};

/**
 * Coque des trois vues des employés (tabulaire, cartes, analytique) : le titre, les onglets de vue, les actions (Importer,
 * Nouvel employé) et la barre de filtres, une seule fois pour toutes les vues. Les filtres sont dans l'URL (voir `filtres/employee-filtres.ts`) : la barre les écrit, chaque vue les lit —
 * ce composant ne garde aucun état partagé de plus. Les écrans de saisie et de consultation (`/employees/new`,
 * `/employees/:id`…) ne passent pas par lui.
 */
@Component({
  selector: 'app-employee-vues',
  imports: [CollectionShellComponent, EmployeeActionsComponent, EmployeeFiltresComponent],
  template: `
    <app-collection-shell [configuration]="configuration" [contentVisible]="vueAffichee()">
      <app-employee-actions collection-actions (importe)="rafraichirVue()"></app-employee-actions>
      <app-employee-filtres collection-filters [value]="filtres()" (valueChange)="appliquer($event)"></app-employee-filtres>
    </app-collection-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeVuesComponent {
  protected readonly configuration = CONFIGURATION_EMPLOYES;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filtres = signal<EmployeeFiltres>(AUCUN_FILTRE);
  /** Faux le temps d'un tour d'écran pour recréer la vue affichée (voir `rafraichirVue`). */
  protected readonly vueAffichee = signal(true);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.filtres.set(lireFiltres(params)));
  }

  /** Les filtres deviennent l'URL de la vue courante (sans empiler l'historique à chaque saisie) ; ce sont les vues qui réagissent. Le périmètre reste synchronisé entre les vues. */
  protected appliquer(filtres: EmployeeFiltres): void {
    void this.router.navigate([], { replaceUrl: true, queryParams: versParametres(filtres), queryParamsHandling: 'merge' });
  }

  /** Après un import : la vue affichée est recréée, elle recharge donc ses données sans avoir à écouter l'import. */
  protected rafraichirVue(): void {
    this.vueAffichee.set(false);
    setTimeout(() => this.vueAffichee.set(true));
  }
}
