/** Couleurs des graphiques : Chart.js dessine dans un canvas et ne lit pas le CSS, on lit donc les Design Tokens
 * (`_tokens.scss`) au moment de construire les données. Valeur de repli neutre si un token manque. */
export function jeton(nom: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || 'gray';
}

/** Couleur n° `rang` (à partir de 1) de la palette des graphiques, qui boucle au-delà de huit. */
export function couleurGraphique(rang: number): string {
  return jeton(`--chart-${((rang - 1) % 8) + 1}`);
}
