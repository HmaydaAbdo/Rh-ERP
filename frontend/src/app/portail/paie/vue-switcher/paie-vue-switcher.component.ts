import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Sélecteur de vue du module Paie : chaque vue est une route lazy de `/paie` (voir `paie.routes.ts`), ce composant
 * ne fait que les relier. Affiché en tête de chaque vue. */
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
    </nav>
  `,
  styles: [
    `
      .vue-switcher {
        display: inline-flex;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        overflow: hidden;
      }

      .vue-switcher__lien {
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
        padding: 0.4rem 0.9rem;
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        text-decoration: none;
        transition: background-color 0.2s, color 0.2s;
      }

      .vue-switcher__lien:hover {
        background: var(--color-surface-alt);
      }

      .vue-switcher__lien--active {
        background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
        color: var(--color-primary);
        font-weight: 600;
      }
    `
  ]
})
export class PaieVueSwitcherComponent {}
