import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Params, Router } from '@angular/router';

import { EtatVue, EtatVueLocal } from '../../../shared/etat-vue/etat-vue';
import { VueOnglet, VueSwitcherComponent } from '../../../shared/ui/vue-switcher/vue-switcher.component';
import { PaieAnalytiqueComponent } from '../analytique/paie-analytique.component';
import { PaieCartesComponent } from '../cartes/paie-cartes.component';
import { lireFiltres, PaieFiltres, versParametres } from '../filtres/paie-filtres';
import { PaieFiltresComponent } from '../filtres/paie-filtres.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { PaieActionsComponent } from '../actions/paie-actions.component';
import { PaieFormDialogComponent } from '../form/paie-form-dialog.component';
import { PaieListComponent } from '../list/paie-list.component';
import { PaieActualisationService } from '../services/paie-actualisation.service';
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
 * page, l'analytique veut un mois : la barre ne propose pas de l'effacer. Les actions d'en-tête Importer et Exporter sont
 * celles de la page (mêmes droits, même audit, KAN-309) ; un import ou un enregistrement recharge toutes les vues de la
 * conversation. « Nouveau bulletin » et « Modifier » ouvrent le formulaire de la page en fenêtre de dialogue (KAN-310) ; voir
 * et supprimer un bulletin quittent la conversation et n'y sont pas (aucune suppression, aucune suppression en groupe).
 */
@Component({
  selector: 'app-paie-vue-integree',
  imports: [ButtonComponent, PaieActionsComponent, PaieFormDialogComponent, PaieFiltresComponent, PaieListComponent, PaieCartesComponent, PaieAnalytiqueComponent, VueSwitcherComponent],
  providers: [{ provide: EtatVue, useFactory: () => new EtatVueLocal() }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'app-vue-integree' },
  template: `
    @if (prete()) {
      <section class="app-vue-integree__page" aria-label="Page de la paie">
        <div class="app-vue-integree__entete">
          <app-vue-switcher label="Vue de la paie" [vues]="vues" [local]="true" [actuelle]="vueCourante()" (choisie)="choisir($event)" />
          <button stp-button variant="text" icon="maximize-2" type="button" class="app-vue-integree__agrandir" (click)="agrandir()">Agrandir</button>
          <app-paie-actions [integree]="true" [periodes]="periodes()" (nouveau)="ouvrirFormulaire(null)" />
        </div>
        <app-paie-filtres
          [periodes]="periodes()"
          [value]="filtres()"
          [moisRequis]="vueCourante() === 'analytique'"
          (valueChange)="appliquer($event)"
        />
        @if (vueAffichee()) {
          @switch (vueCourante()) {
            @case ('cartes') {
              <app-paie-cartes [lectureSeule]="true" />
            }
            @case ('analytique') {
              <app-paie-analytique [integree]="true" />
            }
            @default {
              <app-paie-list [lectureSeule]="true" (modifier)="ouvrirFormulaire($event)" />
            }
          }
        }
        <app-paie-form-dialog [(ouvert)]="formulaireOuvert" [paieId]="paieEnEdition()" (enregistre)="actualisation.signaler()" />
      </section>
    }
  `
})
export class PaieVueIntegreeComponent {
  /** Filtres de départ, au format des paramètres d'URL de la page (`periode`, `nom`, `cin`, `chantierIds`…). */
  readonly depart = input<Params>({});
  /** Vue affichée au départ ; l'utilisateur en change ensuite avec le sélecteur. */
  readonly vue = input<VuePaie>('tabulaire');

  private readonly destroyRef = inject(DestroyRef);
  private readonly etat = inject(EtatVue);
  private readonly paieService = inject(PaieService);
  private readonly router = inject(Router);
  protected readonly actualisation = inject(PaieActualisationService);

  protected readonly vues = VUES;
  /** Mois qui contiennent de la paie, pour griser les autres dans la barre. */
  protected readonly periodes = signal<string[]>([]);
  protected readonly filtres = computed<PaieFiltres>(() => lireFiltres(this.etat.params()));
  protected readonly vueCourante = signal<VuePaie>('tabulaire');
  /** Les filtres de départ sont posés avant de créer la vue : elle lit ses filtres à sa création. */
  protected readonly prete = signal(false);
  /** Faux le temps d'un tour d'écran pour recréer la vue après un import : elle recharge ses données. */
  protected readonly vueAffichee = signal(true);
  /** Formulaire de bulletin en fenêtre de dialogue (KAN-310) : ouvert, et bulletin modifié (`null` : nouveau bulletin). */
  protected readonly formulaireOuvert = signal(false);
  protected readonly paieEnEdition = signal<number | null>(null);

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
    this.chargerPeriodes();
    // Un import réussi, ici ou dans une autre vue de la conversation : mois de la barre et vue affichée se rechargent.
    let derniere = this.actualisation.version();
    effect(() => {
      const version = this.actualisation.version();
      if (version === derniere) {
        return;
      }
      derniere = version;
      untracked(() => {
        this.chargerPeriodes();
        this.vueAffichee.set(false);
        setTimeout(() => this.vueAffichee.set(true));
      });
    });
  }

  private chargerPeriodes(): void {
    this.paieService
      .listerPeriodes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((periodes) => this.periodes.set(periodes.map((p) => p.periode)));
  }

  protected appliquer(filtres: PaieFiltres): void {
    this.etat.modifier(versParametres(filtres));
  }

  protected ouvrirFormulaire(paieId: number | null): void {
    this.paieEnEdition.set(paieId);
    this.formulaireOuvert.set(true);
  }

  /**
   * « Agrandir » (KAN-311) : ouvre la vraie page de la paie, dans la même vue et avec les mêmes filtres (paramètres d'URL).
   * L'état de navigation `depuisAssistant` fait afficher « Retour à la conversation » sur la page ; le retour du navigateur
   * ramène aussi à la conversation, dont le fil est repris (`FilAssistant`).
   */
  protected agrandir(): void {
    const queryParams: Params = {};
    const params = this.etat.params();
    for (const cle of params.keys) {
      const valeurs = params.getAll(cle);
      queryParams[cle] = valeurs.length > 1 ? valeurs : valeurs[0];
    }
    const lien = this.vueCourante() === 'tabulaire' ? '/paie' : `/paie/${this.vueCourante()}`;
    void this.router.navigate([lien], { queryParams, state: { depuisAssistant: true } });
  }

  protected choisir(vue: string): void {
    this.vueCourante.set(vue as VuePaie);
  }
}
