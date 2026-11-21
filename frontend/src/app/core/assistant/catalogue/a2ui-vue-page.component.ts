import { CatalogComponent } from '@a2ui/angular/v0_9';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';

import { PaieVueIntegreeComponent } from '../../../portail/paie/vue-integree/paie-vue-integree.component';
import { VuePageApi } from './api-catalogue';

/**
 * Vue de page intégrée du catalogue ERP : monte la vraie vue du domaine demandé. Seuls les domaines et vues que le
 * schéma annonce sont possibles (liste blanche : l'agent ne désigne jamais un composant quelconque). Les filtres de départ
 * ne servent qu'à la création : ensuite, l'état est celui de la vue.
 */
@Component({
  selector: 'app-a2ui-vue-page',
  imports: [PaieVueIntegreeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (domaine() === 'paie') {
      <app-paie-vue-integree [depart]="depart()" />
    }
  `
})
export class A2uiVuePageComponent extends CatalogComponent<typeof VuePageApi> {
  protected readonly domaine = computed(() => this.props().domaine?.value());
  protected readonly depart = computed(() => (this.props().parametres?.value() ?? {}) as Record<string, string>);
}
