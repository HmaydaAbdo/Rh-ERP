import { CatalogComponent } from '@a2ui/angular/v0_9';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';

import { TimelineApi } from './api-catalogue';

interface Evenement {
  date: string;
  title: string;
  detail?: string;
  tone?: string;
}

/** Frise chronologique du catalogue ERP : événements datés dans l'ordre reçu (l'agent les range du plus ancien au plus récent). */
@Component({
  selector: 'app-a2ui-timeline',
  host: { class: 'app-panel' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (titre()) {
      <h3 class="app-panel__title">{{ titre() }}</h3>
    }
    <ol class="app-timeline">
      @for (evenement of evenements(); track $index) {
        <li class="app-timeline__item" [class.app-timeline__item--positive]="evenement.tone === 'positif'" [class.app-timeline__item--negative]="evenement.tone === 'negatif'">
          <time class="app-timeline__date">{{ evenement.date }}</time>
          <strong class="app-timeline__title">{{ evenement.title }}</strong>
          @if (evenement.detail) {
            <span class="app-timeline__detail">{{ evenement.detail }}</span>
          }
        </li>
      }
    </ol>
  `
})
export class A2uiTimelineComponent extends CatalogComponent<typeof TimelineApi> {
  protected readonly titre = computed(() => this.props().title?.value() as string | undefined);
  protected readonly evenements = computed(() => (this.props().items?.value() ?? []) as Evenement[]);
}
