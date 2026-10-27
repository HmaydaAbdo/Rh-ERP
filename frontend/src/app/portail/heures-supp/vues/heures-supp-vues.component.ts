import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CollectionShellComponent, CollectionShellConfig } from '../../../shared/components/collection-shell/collection-shell.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';

const CONFIG: CollectionShellConfig = {
  titre: 'Heures supplémentaires',
  libelleVue: 'Vues des heures supplémentaires',
  vues: [
    { libelle: 'Tabulaire', icone: 'table', lien: '/heures-supp' },
    { libelle: 'Cartes', icone: 'layout-grid', lien: '/heures-supp/cartes' },
    { libelle: 'Analytique', icone: 'chart-column', lien: '/heures-supp/analytique' }
  ]
};

@Component({
  selector: 'app-heures-supp-vues',
  imports: [CollectionShellComponent, ButtonComponent, RouterLink, MonthInputComponent],
  template: `
    <app-collection-shell [configuration]="configuration">
      <a collection-actions stp-button variant="primary" icon="upload" routerLink="/heures-supp/import">Importer un chantier</a>
      <div collection-filters class="heures-supp-filtres">
        <label>Période <stp-month-input ariaLabel="Période des heures supplémentaires" [value]="mois()" (valueChange)="choisirMois($event)" /></label>
      </div>
    </app-collection-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppVuesComponent {
  protected readonly configuration = CONFIG;
  protected readonly mois = signal<Date | null>(null);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const valeur = params.get('periode');
      this.mois.set(valeur && /^\d{4}-(0[1-9]|1[0-2])$/.test(valeur) ? new Date(Number(valeur.slice(0, 4)), Number(valeur.slice(5, 7)) - 1, 1) : null);
    });
  }

  protected choisirMois(value: Date | null): void {
    const periode = value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}` : null;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { periode, page: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
