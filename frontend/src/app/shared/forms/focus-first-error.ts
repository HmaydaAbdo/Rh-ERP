import { FieldTree } from '@angular/forms/signals';

/**
 * Après une soumission refusée, met le focus sur le premier champ invalide du formulaire et le ramène à l'écran : un
 * utilisateur au clavier ou avec un lecteur d'écran arrive directement sur ce qu'il doit corriger, et le message d'erreur
 * placé sous le champ est annoncé. Un champ composé (sélecteur, mois) donne le focus à son champ interactif (`focus()` du
 * contrôle, voir `shared/ui`).
 */
export function focaliserPremiereErreur(formulaire: FieldTree<unknown>): void {
  const erreur = formulaire().errorSummary()[0];
  if (!erreur) {
    return;
  }
  erreur.fieldTree().focusBoundControl({ preventScroll: true });
  document.activeElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
