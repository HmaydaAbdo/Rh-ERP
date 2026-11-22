import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { IconComponent } from '../icon/icon.component';

/** Un onglet du sélecteur : une vue du module, c'est-à-dire une route lazy. `lien` est absolu (ex. `/paie/cartes`). */
export interface VueOnglet {
  libelle: string;
  icone: string;
  lien: string;
  /** Identifiant de la vue en mode local (voir `local`) ; sans objet pour un sélecteur de routes. */
  cle?: string;
}

/**
 * Sélecteur de vue d'un module à plusieurs vues (Paie, Employés), en onglets soulignés : il ne fait que relier les routes de
 * chaque vue. La première vue est la route racine du module : elle n'est active que sur son URL exacte, les autres le sont
 * aussi sur leurs sous-routes. Les paramètres d'URL (les filtres) sont conservés pour garder le même périmètre d'une vue à
 * l'autre. `label` nomme le repère de navigation pour les technologies d'assistance (ex. « Vue de la paie »).
 */
@Component({
  selector: 'app-vue-switcher',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav class="vue-switcher" [attr.aria-label]="label()">
      @for (vue of vues(); track vue.lien; let premiere = $first) {
        @if (local()) {
          <button
            type="button"
            class="vue-switcher__lien"
            [class.vue-switcher__lien--active]="vue.cle === actuelle()"
            [attr.aria-current]="vue.cle === actuelle() ? 'page' : null"
            (click)="choisie.emit(vue.cle ?? vue.lien)"
          >
            <stp-icon [name]="vue.icone" /> {{ vue.libelle }}
          </button>
        } @else {
          <a
            [routerLink]="vue.lien"
            queryParamsHandling="preserve"
            routerLinkActive="vue-switcher__lien--active"
            [routerLinkActiveOptions]="{ exact: premiere }"
            class="vue-switcher__lien"
          >
            <stp-icon [name]="vue.icone" /> {{ vue.libelle }}
          </a>
        }
      }
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .vue-switcher {
      display: flex;
      min-width: 0;
      width: 100%;
      gap: var(--space-xs);
    }

    // Onglets soulignés : l'onglet actif porte le trait de marque, posé sur le filet de l'en-tête
    .vue-switcher__lien {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      padding: var(--space-sm) var(--space-md);
      margin-bottom: -1px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: none;
      font: inherit;
      font-size: var(--text-base);
      color: var(--color-text-muted);
      text-decoration: none;
      cursor: pointer;
      transition: color var(--duration-fast), border-color var(--duration-fast);
    }

    @media (max-width: 767px) {
      .vue-switcher {
        flex-wrap: wrap;
      }

      .vue-switcher__lien {
        flex: 1 1 0;
        min-width: 0;
        justify-content: center;
        padding-inline: var(--space-sm);
        min-height: 2.75rem;
      }
    }

    .vue-switcher__lien:hover {
      color: var(--color-text);
      border-bottom-color: var(--color-border-strong);
    }

    .vue-switcher__lien--active,
    .vue-switcher__lien--active:hover {
      color: var(--color-primary);
      border-bottom-color: var(--color-primary);
      font-weight: 600;
    }
  `
})
export class VueSwitcherComponent {
  readonly label = input.required<string>();
  readonly vues = input.required<VueOnglet[]>();
  /** Mode local (vue intégrée à la conversation) : des boutons qui changent la vue sans toucher à l'URL ni au routeur. */
  readonly local = input(false);
  /** La vue affichée, en mode local. */
  readonly actuelle = input<string | null>(null);
  /** La vue choisie, en mode local. */
  readonly choisie = output<string>();
}
