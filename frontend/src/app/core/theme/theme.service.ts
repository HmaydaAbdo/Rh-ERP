import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const CLE_STOCKAGE = 'staport-theme';
/** Un peu plus que `--duration-base` : la classe de transition est retirée une fois les couleurs arrivées. */
const DUREE_TRANSITION_MS = 300;

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
  /** Le thème courant ; un graphique (dessiné dans un canvas, qui ne lit pas le CSS) en dépend pour se redessiner à la bascule. */
  readonly theme = signal<Theme>(this.choisi ?? (this.systeme?.matches ? 'dark' : 'light'));

  constructor() {
    this.appliquer(this.theme());
    this.systeme?.addEventListener('change', (evenement) => {
      if (this.choisi === null) {
        this.definir(evenement.matches ? 'dark' : 'light');
      }
    });
  }

  basculer(): void {
    this.choisir(this.theme() === 'dark' ? 'light' : 'dark');
  }

  /** Pose d'abord l'attribut, puis le signal : ceux qui réagissent au signal relisent déjà les jetons du nouveau thème. */
  private definir(theme: Theme): void {
    this.appliquer(theme);
    this.theme.set(theme);
  }

  private appliquer(theme: Theme): void {
    this.document.documentElement.setAttribute('data-theme', theme);
  }

  /** Un choix de l'utilisateur : les couleurs glissent vers le nouveau thème (classe `theme-transition`, voir `styles/_motion.scss`). */
  private choisir(theme: Theme): void {
    this.choisi = theme;
    const racine = this.document.documentElement;
    racine.classList.add('theme-transition');
    this.definir(theme);
    setTimeout(() => racine.classList.remove('theme-transition'), DUREE_TRANSITION_MS);
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
