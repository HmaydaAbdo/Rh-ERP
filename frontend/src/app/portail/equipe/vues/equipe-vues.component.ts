import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { VueOnglet, VueSwitcherComponent } from '../../../shared/components/vue-switcher/vue-switcher.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { AUCUN_FILTRE_EQUIPE, EquipeFiltres, lireFiltresEquipe, versParametresEquipe } from '../filtres/equipe-filtres';
import { EquipeFiltresComponent } from '../filtres/equipe-filtres.component';

const VUES_EQUIPE: VueOnglet[] = [
  { libelle: 'Tabulaire', icone: 'table', lien: '/equipes' },
  { libelle: 'Cartes', icone: 'layout-grid', lien: '/equipes/cartes' },
  { libelle: 'Analytique', icone: 'chart-column', lien: '/equipes/analytique' }
];

@Component({
  selector: 'app-equipe-vues',
  imports: [RouterOutlet, RouterLink, VueSwitcherComponent, EquipeFiltresComponent, ButtonComponent],
  template: `
    <div class="app-vues">
      <div class="app-vues__header">
        <h1>Équipes</h1>
        <app-vue-switcher label="Vues des équipes" [vues]="vues"></app-vue-switcher>
        <div class="app-vues__actions">
          @if (canWrite()) {
            <a stp-button icon="plus" routerLink="/equipes/new">Nouvelle équipe</a>
          }
        </div>
      </div>
      <app-equipe-filtres [value]="filtres()" (valueChange)="appliquer($event)"></app-equipe-filtres>
      <router-outlet></router-outlet>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeVuesComponent {
  protected readonly vues = VUES_EQUIPE;
  protected readonly canWrite = () => this.authService.hasPermission('EQUIPE_WRITE');
  protected readonly filtres = signal<EquipeFiltres>(AUCUN_FILTRE_EQUIPE);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.filtres.set(lireFiltresEquipe(params)));
  }

  protected appliquer(filtres: EquipeFiltres): void {
    void this.router.navigate([], { replaceUrl: true, queryParams: { ...versParametresEquipe(filtres), page: null }, queryParamsHandling: 'merge' });
  }
}
