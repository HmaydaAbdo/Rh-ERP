import { Injectable, signal } from '@angular/core';

/**
 * Pont entre le tableau (qui connaît son tri) et le bouton « Exporter » de l'en-tête, posé à côté d'« Importer » dans les trois vues :
 * l'en-tête porte le bouton et les filtres, le tableau publie ici le tri courant pour que le PDF suive l'ordre affiché.
 */
@Injectable({ providedIn: 'root' })
export class HeuresSuppExportEtat {
  /** Tri de la liste, au format `champ,asc|desc` (tri par défaut : mois décroissant). */
  readonly tri = signal('periode,desc');
  readonly enCours = signal(false);
}
