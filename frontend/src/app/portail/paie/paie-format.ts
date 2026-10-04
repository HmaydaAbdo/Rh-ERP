const LIBELLES_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FORMAT_MONTANT = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `2026-08` -> `août 2026` (chaîne vide si la période est absente). */
export function libellePeriode(periode: string | null): string {
  if (!periode) {
    return '';
  }
  const [annee, mois] = periode.split('-');
  return `${LIBELLES_MOIS[Number(mois) - 1]} ${annee}`;
}

/** `2026-01` -> `2025-12` : le mois contigu qui précède, même s'il ne contient aucune paie. */
export function periodePrecedente(periode: string): string {
  const [annee, mois] = periode.split('-').map(Number);
  return mois === 1 ? `${annee - 1}-12` : `${annee}-${String(mois - 1).padStart(2, '0')}`;
}

/** Montant au format de l'application (`fr-FR`, deux décimales). */
export function formaterMontant(valeur: number): string {
  return FORMAT_MONTANT.format(valeur);
}
