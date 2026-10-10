import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { IconComponent } from '../../../shared/ui/icon/icon.component';

/** Sélecteur de vue du module Paie, en onglets : chaque vue est une route lazy de `/paie` (voir `paie.routes.ts`), ce composant
 * ne fait que les relier — sans reporter les paramètres d'URL : changer de vue réinitialise les filtres. */
@Component({
  selector: 'app-paie-vue-switcher',
  imports: [RouterLink, RouterLinkActive, IconComponent],
    template: `
    <nav class="vue-switcher" aria-label="Vue de la paie">
      <a routerLink="/paie" routerLinkActive="vue-switcher__lien--active" [routerLinkActiveOptions]="{ exact: true }" class="vue-switcher__lien">
        <stp-icon name="table" /> Tabulaire
      </a>
      <a routerLink="/paie/cartes" routerLinkActive="vue-switcher__lien--active" class="vue-switcher__lien">
        <stp-icon name="layout-grid" /> Cartes
      </a>
      <a routerLink="/paie/analytique" routerLinkActive="vue-switcher__lien--active" class="vue-switcher__lien">
        <stp-icon name="chart-column" /> Analytique
      </a>
    </nav>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
      .vue-switcher {
        display: flex;
        gap: var(--space-xs);
      }

      // Onglets soulignés : l'onglet actif porte le trait de marque, posé sur le filet de l'en-tête
      .vue-switcher__lien {
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
        padding: var(--space-sm) var(--space-md);
        margin-bottom: -1px;
        border-bottom: 2px solid transparent;
        font-size: var(--text-base);
        color: var(--color-text-muted);
        text-decoration: none;
        transition: color var(--duration-fast), border-color var(--duration-fast);
      }

      @media (max-width: 767px) {
        .vue-switcher__lien {
          flex: 1;
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
export class PaieVueSwitcherComponent {}
