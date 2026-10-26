export type FormatColonne = 'texte' | 'nombre' | 'montant' | 'periode';

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
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

/** Le CSV d'un tableau (séparateur `;` et BOM : Excel en français l'ouvre sans assistant), valeurs brutes. */
export function versCsv(
  colonnes: readonly { key: string; label: string }[],
  lignes: readonly Record<string, unknown>[]
): string {
  const echapper = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const corps = lignes.map((ligne) => colonnes.map((c) => echapper(ligne[c.key])).join(';'));
  return '﻿' + [colonnes.map((c) => echapper(c.label)).join(';'), ...corps].join('\r\n');
}

/** Ordre de tri d'une colonne : nombres par valeur, texte par ordre alphabétique français, vides en dernier. */
export function comparer(a: unknown, b: unknown): number {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1;
  if (b == null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
}
