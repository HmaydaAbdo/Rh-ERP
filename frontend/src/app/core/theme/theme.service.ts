import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const CLE_STOCKAGE = 'staport-theme';

/**
 * Thème clair ou sombre de l'application, porté par `data-theme` sur `<html>` (voir `styles/_tokens.scss`). Tant que
 * l'utilisateur n'a pas choisi, le thème suit la préférence de son système ; son choix est ensuite mémorisé sur ce navigateur
 * (confort local : jamais une donnée métier, jamais envoyée au serveur). Le script d'`index.html` applique la même règle avant
 * le premier affichage, pour éviter un flash du mauvais thème.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly systeme = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');

  private choisi = this.lireChoix();
  readonly theme = signal<Theme>(this.choisi ?? (this.systeme?.matches ? 'dark' : 'light'));

  constructor() {
    effect(() => this.document.documentElement.setAttribute('data-theme', this.theme()));
    this.systeme?.addEventListener('change', (evenement) => {
      if (this.choisi === null) {
        this.theme.set(evenement.matches ? 'dark' : 'light');
      }
    });
  }

  basculer(): void {
    this.choisir(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private choisir(theme: Theme): void {
    this.choisi = theme;
    this.theme.set(theme);
    try {
      localStorage.setItem(CLE_STOCKAGE, theme);
    } catch {
      // Stockage indisponible (navigation privée, données bloquées) : le thème reste valable pour la session.
    }
  }

  private lireChoix(): Theme | null {
    try {
      const valeur = localStorage.getItem(CLE_STOCKAGE);
      return valeur === 'light' || valeur === 'dark' ? valeur : null;
    } catch {
      return null;
    }
  }
}
