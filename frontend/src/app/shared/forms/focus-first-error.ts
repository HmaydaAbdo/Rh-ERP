/**
 * Après une soumission refusée, met le focus sur le premier champ invalide du formulaire affiché et le ramène à l'écran : un
 * utilisateur au clavier ou avec un lecteur d'écran arrive directement sur ce qu'il doit corriger, et le message d'erreur
 * placé sous le champ est annoncé. Un champ composé (calendrier, sélecteur) donne le focus à son champ interactif.
 */
export function focaliserPremiereErreur(): void {
  const invalide = document.querySelector<HTMLElement>('form .ng-invalid:not(form)');
  if (!invalide) {
    return;
  }
  const cible = invalide.matches('input, textarea, select, button')
    ? invalide
    : invalide.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, [tabindex="0"], button');
  cible?.focus({ preventScroll: true });
  (cible ?? invalide).scrollIntoView({ block: 'center', behavior: 'smooth' });
}
