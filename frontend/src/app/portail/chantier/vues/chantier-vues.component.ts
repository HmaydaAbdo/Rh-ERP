import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { VueOnglet, VueSwitcherComponent } from '../../../shared/components/vue-switcher/vue-switcher.component';
import { ChantierActionsComponent } from '../actions/chantier-actions.component';
import { AUCUN_FILTRE_CHANTIER, ChantierFiltres, lireFiltresChantier, versParametresChantier } from '../filtres/chantier-filtres';
import { ChantierFiltresComponent } from '../filtres/chantier-filtres.component';

/** Les trois vues des chantiers, dans l'ordre des onglets (voir `chantier.routes.ts`). */
const VUES_CHANTIER: VueOnglet[] = [
  { libelle: 'Tabulaire', icone: 'table', lien: '/chantiers' },
  { libelle: 'Cartes', icone: 'layout-grid', lien: '/chantiers/cartes' },
  { libelle: 'Analytique', icone: 'chart-column', lien: '/chantiers/analytique' }
];

/**
 * Coque des trois vues des chantiers (tabulaire, cartes, analytique) : le titre, les onglets de vue, les actions (Synchroniser,
 * Nouveau chantier) et la barre de filtres, une seule fois pour toutes les vues. Les filtres sont dans l'URL (voir
 * `filtres/chantier-filtres.ts`) : la barre les écrit, chaque vue les lit. La carte géographique (`/carte`) est un écran à part.
 * Les écrans de saisie et de consultation (`/chantiers/new`, `/chantiers/:id`…) ne passent pas par lui.
 */
@Component({
  selector: 'app-chantier-vues',
  imports: [RouterOutlet, VueSwitcherComponent, ChantierActionsComponent, ChantierFiltresComponent],
  template: `
    <div class="app-vues">
      <div class="app-vues__header">
        <h1>Chantiers</h1>
        <app-vue-switcher label="Vues des chantiers" [vues]="vues"></app-vue-switcher>
        <app-chantier-actions class="app-vues__actions" (synchronise)="rafraichirVue()"></app-chantier-actions>
      </div>
      <app-chantier-filtres [value]="filtres()" (valueChange)="appliquer($event)"></app-chantier-filtres>
      @if (vueAffichee()) {
        <router-outlet></router-outlet>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierVuesComponent {
  protected readonly vues = VUES_CHANTIER;
  protected readonly filtres = signal<ChantierFiltres>(AUCUN_FILTRE_CHANTIER);
  /** Faux le temps d'un tour d'écran pour recréer la vue affichée (voir `rafraichirVue`). */
  protected readonly vueAffichee = signal(true);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.filtres.set(lireFiltresChantier(params)));
  }

  protected appliquer(filtres: ChantierFiltres): void {
    void this.router.navigate([], { replaceUrl: true, queryParams: { ...versParametresChantier(filtres), page: null }, queryParamsHandling: 'merge' });
  }

  /** Après une synchronisation : la vue affichée est recréée, elle recharge donc ses données sans avoir à écouter l'action. */
  protected rafraichirVue(): void {
    this.vueAffichee.set(false);
    setTimeout(() => this.vueAffichee.set(true));
  }
}
