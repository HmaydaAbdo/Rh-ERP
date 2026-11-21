import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Params } from '@angular/router';

import { EtatVue, EtatVueLocal } from '../../../shared/etat-vue/etat-vue';
import { lireFiltres, PaieFiltres, versParametres } from '../filtres/paie-filtres';
import { PaieFiltresComponent } from '../filtres/paie-filtres.component';
import { PaieListComponent } from '../list/paie-list.component';
import { PaieService } from '../services/paie.service';

/**
 * La vue tabulaire de la paie, avec sa barre de filtres, dans la conversation de l'assistant (KAN-307, épopée E23).
 *
 * C'est la vraie page : mêmes composants (`app-paie-filtres`, `app-paie-list`), mêmes services, donc mêmes droits (le jeton
 * de l'utilisateur est celui de l'API : sans `PAIE_READ`, la liste est refusée) et mêmes chiffres. Seul l'état change :
 * chaque instance fournit son `EtatVueLocal`, initialisé par les filtres de départ que l'agent a posés (`depart`, mêmes
 * paramètres que l'URL de la page). Filtrer ensuite ne passe ni par l'URL ni par l'agent, et plusieurs vues coexistent.
 * Lecture seule : les actions de ligne et d'en-tête qui quittent la conversation arrivent avec KAN-309 et KAN-310.
 */
@Component({
  selector: 'app-paie-vue-integree',
  imports: [PaieFiltresComponent, PaieListComponent],
  providers: [{ provide: EtatVue, useFactory: () => new EtatVueLocal() }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'app-vue-integree' },
  template: `
    @if (prete()) {
      <section class="app-vue-integree__page" aria-label="Vue de la paie">
        <app-paie-filtres [periodes]="periodes()" [value]="filtres()" (valueChange)="appliquer($event)" />
        <app-paie-list [lectureSeule]="true" />
      </section>
    }
  `
})
export class PaieVueIntegreeComponent {
  /** Filtres de départ, au format des paramètres d'URL de la page (`periode`, `nom`, `cin`, `chantierIds`…). */
  readonly depart = input<Params>({});

  private readonly etat = inject(EtatVue);
  private readonly paieService = inject(PaieService);

  /** Mois qui contiennent de la paie, pour griser les autres dans la barre. */
  protected readonly periodes = signal<string[]>([]);
  protected readonly filtres = computed<PaieFiltres>(() => lireFiltres(this.etat.params()));
  /** Les filtres de départ sont posés avant de créer la liste : elle lit ses filtres à sa création. */
  protected readonly prete = signal(false);

  constructor() {
    effect(() => {
      const depart = this.depart();
      untracked(() => {
        if (!this.prete()) {
          this.etat.modifier(depart);
          this.prete.set(true);
        }
      });
    });
    this.paieService
      .listerPeriodes()
      .pipe(takeUntilDestroyed())
      .subscribe((periodes) => this.periodes.set(periodes.map((p) => p.periode)));
  }

  protected appliquer(filtres: PaieFiltres): void {
    this.etat.modifier(versParametres(filtres));
  }
}
