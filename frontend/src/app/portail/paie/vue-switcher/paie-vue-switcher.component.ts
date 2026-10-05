import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Sélecteur de vue du module Paie, en onglets : chaque vue est une route lazy de `/paie` (voir `paie.routes.ts`), ce composant
 * ne fait que les relier — sans reporter les paramètres d'URL : changer de vue réinitialise les filtres. */
@Component({
  selector: 'app-paie-vue-switcher',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="vue-switcher" aria-label="Vue de la paie">
      <a routerLink="/paie" routerLinkActive="vue-switcher__lien--active" [routerLinkActiveOptions]="{ exact: true }" class="vue-switcher__lien">
        <i class="pi pi-table" aria-hidden="true"></i> Tabulaire
      </a>
      <a routerLink="/paie/cartes" routerLinkActive="vue-switcher__lien--active" class="vue-switcher__lien">
        <i class="pi pi-th-large" aria-hidden="true"></i> Cartes
      </a>
      <a routerLink="/paie/analytique" routerLinkActive="vue-switcher__lien--active" class="vue-switcher__lien">
        <i class="pi pi-chart-bar" aria-hidden="true"></i> Analytique
      </a>
    </nav>
  `,
  styles: [
    `
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
  ]
})
export class PaieVueSwitcherComponent {}
