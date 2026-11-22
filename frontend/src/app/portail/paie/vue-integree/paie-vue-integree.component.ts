import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Params } from '@angular/router';

import { EtatVue, EtatVueLocal } from '../../../shared/etat-vue/etat-vue';
import { VueOnglet, VueSwitcherComponent } from '../../../shared/ui/vue-switcher/vue-switcher.component';
import { PaieAnalytiqueComponent } from '../analytique/paie-analytique.component';
import { PaieCartesComponent } from '../cartes/paie-cartes.component';
import { lireFiltres, PaieFiltres, versParametres } from '../filtres/paie-filtres';
import { PaieFiltresComponent } from '../filtres/paie-filtres.component';
import { PaieListComponent } from '../list/paie-list.component';
import { PaieService } from '../services/paie.service';

/** Les trois vues de la page de la paie (mêmes noms que les onglets de `paie-vues.component.ts`). */
export type VuePaie = 'tabulaire' | 'cartes' | 'analytique';

const VUES: VueOnglet[] = [
  { cle: 'tabulaire', libelle: 'Tabulaire', icone: 'table', lien: 'tabulaire' },
  { cle: 'cartes', libelle: 'Cartes', icone: 'layout-grid', lien: 'cartes' },
  { cle: 'analytique', libelle: 'Analytique', icone: 'chart-column', lien: 'analytique' }
];

/**
 * La page de la paie (sélecteur de vue, filtres, vue) dans la conversation de l'assistant (KAN-307 puis KAN-308,
 * épopée E23).
 *
 * C'est la vraie page : mêmes composants (`app-paie-filtres`, `app-paie-list`, `app-paie-cartes`, `app-paie-analytique`),
 * mêmes services, donc mêmes droits (le jeton de l'utilisateur est celui de l'API : sans `PAIE_READ`, la liste est
 * refusée) et mêmes chiffres. Seul l'état change : chaque instance fournit son `EtatVueLocal`, initialisé par les
 * filtres de départ que l'agent a posés (`depart`, mêmes paramètres que l'URL de la page) et par la vue de départ
 * (`vue`). Filtrer ou changer de vue ne passe ni par l'URL ni par l'agent, et plusieurs vues coexistent. Comme sur la
 * page, l'analytique veut un mois : la barre ne propose pas de l'effacer. Lecture seule : les actions de ligne et
 * d'en-tête qui quittent la conversation arrivent avec KAN-309 et KAN-310 (aucune suppression en groupe ici).
 */
@Component({
  selector: 'app-paie-vue-integree',
  imports: [PaieFiltresComponent, PaieListComponent, PaieCartesComponent, PaieAnalytiqueComponent, VueSwitcherComponent],
  providers: [{ provide: EtatVue, useFactory: () => new EtatVueLocal() }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'app-vue-integree' },
  template: `
    @if (prete()) {
      <section class="app-vue-integree__page" aria-label="Page de la paie">
        <app-vue-switcher label="Vue de la paie" [vues]="vues" [local]="true" [actuelle]="vueCourante()" (choisie)="choisir($event)" />
        <app-paie-filtres
          [periodes]="periodes()"
          [value]="filtres()"
          [moisRequis]="vueCourante() === 'analytique'"
          (valueChange)="appliquer($event)"
        />
        @switch (vueCourante()) {
          @case ('cartes') {
            <app-paie-cartes [lectureSeule]="true" />
          }
          @case ('analytique') {
            <app-paie-analytique [integree]="true" />
          }
          @default {
            <app-paie-list [lectureSeule]="true" />
          }
        }
      </section>
    }
  `
})
export class PaieVueIntegreeComponent {
  /** Filtres de départ, au format des paramètres d'URL de la page (`periode`, `nom`, `cin`, `chantierIds`…). */
  readonly depart = input<Params>({});
  /** Vue affichée au départ ; l'utilisateur en change ensuite avec le sélecteur. */
  readonly vue = input<VuePaie>('tabulaire');

  private readonly etat = inject(EtatVue);
  private readonly paieService = inject(PaieService);

  protected readonly vues = VUES;
  /** Mois qui contiennent de la paie, pour griser les autres dans la barre. */
  protected readonly periodes = signal<string[]>([]);
  protected readonly filtres = computed<PaieFiltres>(() => lireFiltres(this.etat.params()));
  protected readonly vueCourante = signal<VuePaie>('tabulaire');
  /** Les filtres de départ sont posés avant de créer la vue : elle lit ses filtres à sa création. */
  protected readonly prete = signal(false);

  constructor() {
    effect(() => {
      const depart = this.depart();
      const vue = this.vue();
      untracked(() => {
        if (!this.prete()) {
          this.etat.modifier(depart);
          this.vueCourante.set(vue);
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

  protected choisir(vue: string): void {
    this.vueCourante.set(vue as VuePaie);
  }
}
