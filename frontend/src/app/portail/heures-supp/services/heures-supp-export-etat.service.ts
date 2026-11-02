import { Injectable, signal } from '@angular/core';

/**
 * Pont entre la vue Tabulaire et le bouton « Exporter » de l'en-tête (posé à côté d'Importer) : le tableau connaît ses filtres et son
 * tri, l'en-tête porte le bouton. Sans tableau affiché (vues Cartes et Analytique), il n'y a rien à exporter et le bouton est absent.
 */
@Injectable({ providedIn: 'root' })
export class HeuresSuppExportEtat {
  /** Export du tableau affiché (filtres, recherche et tri courants) ; `null` quand la vue Tabulaire n'est pas affichée. */
  readonly exporter = signal<(() => void) | null>(null);
  readonly enCours = signal(false);
}
