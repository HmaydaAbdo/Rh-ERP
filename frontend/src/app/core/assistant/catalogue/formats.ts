export type FormatColonne = 'texte' | 'nombre' | 'montant' | 'periode';

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const MONTANT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Une valeur de cellule telle qu'on la lit à l'écran : nombres à la française, montants en MAD, vide en tiret. */
export function formater(valeur: unknown, format: FormatColonne = 'texte'): string {
  if (valeur === null || valeur === undefined || valeur === '') {
    return '—';
  }
  if (typeof valeur === 'boolean') {
    return valeur ? 'Oui' : 'Non';
  }
  if (typeof valeur === 'number') {
    return format === 'montant' ? `${MONTANT.format(valeur)} MAD` : NOMBRE.format(valeur);
  }
  return String(valeur);
}
