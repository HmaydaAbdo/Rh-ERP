import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { VueOnglet, VueSwitcherComponent } from '../../../shared/components/vue-switcher/vue-switcher.component';
import { FunctionActionsComponent } from '../actions/function-actions.component';
import { AUCUN_FILTRE_FUNCTION, FunctionFiltres, lireFiltresFunction, versParametresFunction } from '../filtres/function-filtres';
import { FunctionFiltresComponent } from '../filtres/function-filtres.component';

/** Les trois vues des fonctions, dans l'ordre des onglets (voir `function.routes.ts`). */
const VUES_FUNCTION: VueOnglet[] = [
  { libelle: 'Tabulaire', icone: 'table', lien: '/functions' },
  { libelle: 'Cartes', icone: 'layout-grid', lien: '/functions/cartes' },
  { libelle: 'Analytique', icone: 'chart-column', lien: '/functions/analytique' }
];

/**
 * Coque des trois vues des fonctions (tabulaire, cartes, analytique) : le titre, les onglets de vue, les actions (Importer,
 * Nouvelle fonction) et la barre de filtres, une seule fois pour toutes les vues. Le filtre est dans l'URL (voir
 * `filtres/function-filtres.ts`) : la barre l'écrit, chaque vue le lit. Les écrans de saisie et de consultation
 * (`/functions/new`, `/functions/:id`…) ne passent pas par lui.
 */
@Component({
  selector: 'app-function-vues',
  imports: [RouterOutlet, VueSwitcherComponent, FunctionActionsComponent, FunctionFiltresComponent],
  template: `
    <div class="app-vues">
      <div class="app-vues__header">
        <h1>Fonctions</h1>
        <app-vue-switcher label="Vues des fonctions" [vues]="vues"></app-vue-switcher>
        <app-function-actions class="app-vues__actions" (importe)="rafraichirVue()"></app-function-actions>
      </div>
      <app-function-filtres [value]="filtres()" (valueChange)="appliquer($event)"></app-function-filtres>
      @if (vueAffichee()) {
        <router-outlet></router-outlet>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunctionVuesComponent {
  protected readonly vues = VUES_FUNCTION;
  protected readonly filtres = signal<FunctionFiltres>(AUCUN_FILTRE_FUNCTION);
  /** Faux le temps d'un tour d'écran pour recréer la vue affichée (voir `rafraichirVue`). */
  protected readonly vueAffichee = signal(true);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.filtres.set(lireFiltresFunction(params)));
  }

  protected appliquer(filtres: FunctionFiltres): void {
    void this.router.navigate([], { replaceUrl: true, queryParams: { ...versParametresFunction(filtres), page: null }, queryParamsHandling: 'merge' });
  }

  /** Après un import : la vue affichée est recréée, elle recharge donc ses données sans avoir à écouter l'import. */
  protected rafraichirVue(): void {
    this.vueAffichee.set(false);
    setTimeout(() => this.vueAffichee.set(true));
  }
}
