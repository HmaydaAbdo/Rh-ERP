import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { VueOnglet, VueSwitcherComponent } from '../vue-switcher/vue-switcher.component';

/** Contrat de présentation partagé des collections métier. Les permissions restent évaluées par le domaine. */
export interface CollectionShellConfig {
  titre: string;
  libelleVue: string;
  vues: VueOnglet[];
}

/** Structure commune des pages de collection; les actions et filtres métier sont projetés par le domaine. */
@Component({
  selector: 'app-collection-shell',
  imports: [RouterOutlet, VueSwitcherComponent],
  template: `
    <div class="app-vues">
      <div class="app-vues__header">
        <h1>{{ configuration().titre }}</h1>
        <app-vue-switcher [label]="configuration().libelleVue" [vues]="configuration().vues"></app-vue-switcher>
        <div class="app-vues__actions"><ng-content select="[collection-actions]"></ng-content></div>
      </div>
      <ng-content select="[collection-filters]"></ng-content>
      @if (contentVisible()) {
        <router-outlet (activate)="outletActivated.emit($event)"></router-outlet>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollectionShellComponent {
  readonly configuration = input.required<CollectionShellConfig>();
  readonly contentVisible = input(true);
  readonly outletActivated = output<unknown>();
}
