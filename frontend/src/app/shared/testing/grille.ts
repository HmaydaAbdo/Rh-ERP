import { ApplicationRef } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

const image = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Attend qu'AG Grid ait dessiné ses lignes : la grille peint après la détection de changements, sur les images suivantes.
 * Revient quand le nombre de lignes et le texte de la grille ne bougent plus pendant six images.
 */
export async function attendreGrille(fixture: ComponentFixture<unknown>): Promise<void> {
  const racine = fixture.nativeElement as HTMLElement;
  let precedent = -1;
  let stable = 0;
  for (let i = 0; i < 60; i++) {
    await image();
    fixture.detectChanges();
    TestBed.inject(ApplicationRef).tick();
    const grille = racine.querySelector('.ag-root');
    const compte =
      racine.querySelectorAll('.ag-row, .ag-overlay-no-rows-center, .ag-overlay-loading-center').length * 100000 + (grille?.textContent?.length ?? 0);
    stable = grille && compte === precedent ? stable + 1 : 0;
    precedent = compte;
    if (stable >= 6 && i >= 8) {
      return;
    }
  }
}

/**
 * Une ligne logique de la grille : AG Grid répartit une même ligne dans plusieurs éléments quand une colonne est épinglée
 * (colonne de gauche, centre, colonne de droite) ; cette classe les regroupe dans l'ordre d'affichage.
 */
export class LigneGrille {
  constructor(readonly elements: readonly HTMLElement[]) {}

  /** Cellules de la ligne, de gauche à droite. */
  get cells(): HTMLElement[] {
    return this.elements.flatMap((element) => Array.from(element.querySelectorAll<HTMLElement>('.ag-cell')));
  }

  get textContent(): string {
    return this.cells.map((cellule) => cellule.textContent ?? '').join(' ');
  }

  querySelector<E extends HTMLElement = HTMLElement>(selecteur: string): E | null {
    for (const element of this.elements) {
      const trouve = element.querySelector<E>(selecteur);
      if (trouve) {
        return trouve;
      }
    }
    return null;
  }

  querySelectorAll<E extends HTMLElement = HTMLElement>(selecteur: string): E[] {
    return this.elements.flatMap((element) => Array.from(element.querySelectorAll<E>(selecteur)));
  }
}

/** Lignes de données d'une grille (hors pied épinglé), dans l'ordre d'affichage. */
export function lignesGrille(racine: ParentNode): LigneGrille[] {
  const parIndex = new Map<number, HTMLElement[]>();
  for (const element of Array.from(racine.querySelectorAll<HTMLElement>('.ag-row'))) {
    if (element.closest('.ag-grid-pinned-bottom-rows, .ag-grid-pinned-top-rows, .ag-floating-bottom, .ag-floating-top')) {
      continue;
    }
    const index = Number(element.getAttribute('row-index'));
    parIndex.set(index, [...(parIndex.get(index) ?? []), element]);
  }
  const ordreConteneur = (element: HTMLElement) => (element.closest('[class*="pinned-left"]') ? 0 : element.closest('[class*="pinned-right"]') ? 2 : 1);
  return Array.from(parIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([, elements]) => new LigneGrille([...elements].sort((a, b) => ordreConteneur(a) - ordreConteneur(b))));
}
