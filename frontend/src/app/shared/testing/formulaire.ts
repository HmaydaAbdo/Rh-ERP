/** Aides des tests de composants : agir sur un formulaire comme l'utilisateur (saisie, soumission), pas sur son état interne. */

/** Saisit `valeur` dans un champ texte (événement `input`, comme au clavier). */
export function saisir(racine: HTMLElement, selecteur: string, valeur: string): void {
  const champ = racine.querySelector<HTMLInputElement>(selecteur);
  if (!champ) {
    throw new Error(`Champ introuvable : ${selecteur}`);
  }
  champ.value = valeur;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Soumet le formulaire (Entrée dans un champ, ou clic sur le bouton d'envoi). */
export function soumettre(racine: HTMLElement, selecteur = 'form'): void {
  const formulaire = racine.querySelector<HTMLFormElement>(selecteur);
  if (!formulaire) {
    throw new Error(`Formulaire introuvable : ${selecteur}`);
  }
  formulaire.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
