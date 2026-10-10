import { Signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, skip } from 'rxjs';

/**
 * Relance `action` (une recherche) chaque fois que les filtres d'une liste changent — pas pour leur valeur initiale, que le
 * tableau charge lui-même. Les champs texte sont retardés par la règle `debounce` du formulaire : la valeur du modèle ne change
 * qu'une fois la frappe terminée. À appeler dans un contexte d'injection (constructeur).
 */
export function surChangementDesFiltres<T>(filtres: Signal<T>, action: () => void): void {
  toObservable(filtres)
    .pipe(
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      skip(1),
      takeUntilDestroyed()
    )
    .subscribe(action);
}
