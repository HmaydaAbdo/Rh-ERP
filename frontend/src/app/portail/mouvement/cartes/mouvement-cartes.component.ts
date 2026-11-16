import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { SelectComponent, SelectOption } from '../../../shared/ui/select/select.component';
import { DimensionMouvement, grouperMouvements, GroupeMouvement, LIBELLES_DIMENSION, LigneMouvement } from '../mouvement-agregats';

const PAS = 12;

/**
 * Vue Cartes d'un domaine de mouvements : une carte par groupe (chantier, équipe, fonction ou catégorie, au choix), avec le
 * nombre de mouvements du mois, leur répartition par catégorie et le montant des bulletins quand la paie est lisible. Chaque
 * carte renvoie vers la vue Tabulaire filtrée sur le groupe. Les lignes viennent de l'état du mois du domaine : aucune requête
 * propre à la vue.
 */
@Component({
  selector: 'app-mouvement-cartes',
  imports: [DecimalPipe, ButtonComponent, MessageComponent, RouterLink, SelectComponent],
  template: `
    <div class="app-entitys">
      <div class="app-bar-actions">
        <div class="app-actions-row">
          <label class="app-field-label"
            >Regrouper par
            <stp-select ariaLabel="Regrouper les cartes par" [clearable]="false" [options]="optionsDimensions()" [value]="dimension()" (valueChange)="changerDimension($event)" />
          </label>
        </div>
      </div>
      @if (message(); as texte) {
        <stp-message severity="warn" [text]="texte" />
      }
      <div class="app-busy" [attr.aria-busy]="chargement()">
        @if (chargement()) {
          <stp-message text="Chargement du mois…" />
        }
        <section class="app-results" aria-label="Résultats du mois">
          <div class="app-results__head">
            <p class="app-muted" role="status">{{ resume() }}</p>
          </div>
          @if (!chargement() && groupes().length === 0) {
            <p class="app-muted">Aucun élément ne correspond à ce mois et à ces filtres.</p>
          }
          <ul class="app-entity-grid">
            @for (groupe of visibles(); track groupe.cle; let i = $index) {
              <li [style.animation-delay.ms]="i < 12 ? i * 35 : 0">
                <article class="app-entity">
                  <div class="app-entity__body">
                    <span class="app-entity__head">
                      <span class="app-entity__name">{{ groupe.libelle }}</span>
                    </span>
                    <dl class="app-entity__metrics">
                      <div class="app-entity__indicator">
                        <dt>{{ libelleUnite() }} du mois</dt>
                        <dd>
                          <strong>{{ groupe.nombre }}</strong>
                          <small class="app-entity__variation">{{ part(groupe) }} % du mois</small>
                        </dd>
                      </div>
                      @if (dimension() !== 'categorie') {
                        <div class="app-entity__indicator">
                          <dt>{{ libelleCategorie() }}</dt>
                          <dd>
                            <small>{{ detailCategories(groupe) }}</small>
                          </dd>
                        </div>
                      }
                      @if (groupe.montant !== null) {
                        <div class="app-entity__indicator">
                          <dt>Montant des bulletins</dt>
                          <dd>
                            <strong>{{ groupe.montant | number: '1.0-0' }} DH</strong>
                          </dd>
                        </div>
                      }
                    </dl>
                  </div>
                  @if (listeDisponible(groupe)) {
                  <div class="app-entity__footer">
                    <a
                      stp-button
                      variant="text"
                      icon="table"
                      [routerLink]="route()"
                      [queryParams]="parametresListe(groupe)"
                      queryParamsHandling="merge"
                      [attr.aria-label]="'Voir la liste : ' + groupe.libelle"
                      [attr.title]="'Voir la liste : ' + groupe.libelle"
                      >Voir la liste</a
                    >
                  </div>
                  }
                </article>
              </li>
            }
          </ul>
          @if (visibles().length < groupes().length) {
            <div class="app-more">
              <button stp-button variant="secondary" type="button" (click)="afficherPlus()">Afficher plus ({{ groupes().length - visibles().length }} restants)</button>
            </div>
          }
        </section>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MouvementCartesComponent {
  readonly lignes = input.required<LigneMouvement[]>();
  readonly chargement = input(false);
  /** Route de la vue Tabulaire du domaine (`/entrants`) : la cible de « Voir la liste ». */
  readonly route = input.required<string>();
  /** Pluriel capitalisé du domaine : « Entrants », « Sorties ». */
  readonly libelleUnite = input.required<string>();
  /** Nom de la catégorie du domaine : « Type d’entrée », « Motif ». */
  readonly libelleCategorie = input.required<string>();
  /** Avertissement du domaine (mois non comparable pour les entrants). */
  readonly message = input<string | null>(null);

  protected readonly dimension = signal<DimensionMouvement>('chantier');
  private readonly visiblesCount = signal(PAS);

  protected readonly optionsDimensions = computed<SelectOption<DimensionMouvement>[]>(() => [
    { value: 'chantier', label: LIBELLES_DIMENSION.chantier },
    { value: 'equipe', label: LIBELLES_DIMENSION.equipe },
    { value: 'fonction', label: LIBELLES_DIMENSION.fonction },
    { value: 'categorie', label: this.libelleCategorie() }
  ]);

  protected readonly groupes = computed(() => grouperMouvements(this.lignes(), this.dimension()));
  protected readonly visibles = computed(() => this.groupes().slice(0, this.visiblesCount()));
  protected readonly resume = computed(() => {
    const total = this.lignes().length;
    const groupes = this.groupes().length;
    return `${total} ${this.libelleUnite().toLowerCase()} · ${groupes} groupe${groupes > 1 ? 's' : ''}`;
  });

  protected changerDimension(valeur: unknown): void {
    if (valeur === 'chantier' || valeur === 'equipe' || valeur === 'fonction' || valeur === 'categorie') {
      this.dimension.set(valeur);
      this.visiblesCount.set(PAS);
    }
  }

  protected afficherPlus(): void {
    this.visiblesCount.update((n) => n + PAS);
  }

  protected part(groupe: GroupeMouvement): number {
    const total = this.lignes().length;
    return total > 0 ? Math.round((groupe.nombre * 100) / total) : 0;
  }

  /** Les fonctions n'ont pas de filtre « sans fonction » : une carte sans fonction ne renvoie pas à la liste. */
  protected listeDisponible(groupe: GroupeMouvement): boolean {
    return !(groupe.filtre.dimension === 'fonction' && groupe.filtre.valeur === 0);
  }

  protected detailCategories(groupe: GroupeMouvement): string {
    return groupe.parCategorie.map((c) => `${c.categorie} : ${c.nombre}`).join(', ');
  }

  /** Les paramètres d'URL qui ramènent la liste du domaine à ce groupe (le mois et les autres filtres sont conservés). */
  protected parametresListe(groupe: GroupeMouvement): Params {
    const { dimension, valeur } = groupe.filtre;
    switch (dimension) {
      case 'chantier':
        return { chantierIds: valeur };
      case 'equipe':
        return { equipeIds: valeur };
      case 'fonction':
        return { fonctionIds: valeur };
      default:
        return { valeurs: valeur };
    }
  }
}
