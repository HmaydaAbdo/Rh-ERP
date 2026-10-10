import { catchError, EMPTY, lastValueFrom, Observable } from 'rxjs';

/**
 * Attend la réponse d'une requête d'enregistrement pour l'action de soumission d'un formulaire (`submission.action`), qui
 * attend une promesse. Une erreur HTTP a déjà été notifiée à l'utilisateur par `errorInterceptor` : la promesse se résout alors
 * sans valeur (le formulaire reste affiché, prêt à être corrigé) au lieu de rejeter une erreur que personne ne traiterait.
 */
export function attendreEnregistrement<T>(requete$: Observable<T>): Promise<T | undefined> {
  return lastValueFrom(requete$.pipe(catchError(() => EMPTY)), { defaultValue: undefined });
}
