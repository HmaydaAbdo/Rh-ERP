import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { CollectionShellComponent, CollectionShellConfig } from '../../../shared/components/collection-shell/collection-shell.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { AUCUN_FILTRE_EQUIPE, EquipeFiltres, lireFiltresEquipe, versParametresEquipe } from '../filtres/equipe-filtres';
import { EquipeFiltresComponent } from '../filtres/equipe-filtres.component';

const CONFIGURATION_EQUIPE: CollectionShellConfig = {
  titre: 'Équipes',
  libelleVue: 'Vues des équipes',
  vues: [
    { libelle: 'Tabulaire', icone: 'table', lien: '/equipes' },
    { libelle: 'Cartes', icone: 'layout-grid', lien: '/equipes/cartes' },
    { libelle: 'Analytique', icone: 'chart-column', lien: '/equipes/analytique' }
  ]
};

@Component({
  selector: 'app-equipe-vues',
  imports: [CollectionShellComponent, RouterLink, EquipeFiltresComponent, ButtonComponent],
  template: `
    <app-collection-shell [configuration]="configuration">
      <div collection-actions>
        @if (canWrite()) {
          <a stp-button icon="plus" routerLink="/equipes/new">Nouvelle équipe</a>
        }
      </div>
      <app-equipe-filtres collection-filters [value]="filtres()" (valueChange)="appliquer($event)"></app-equipe-filtres>
    </app-collection-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeVuesComponent {
  protected readonly configuration = CONFIGURATION_EQUIPE;
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
