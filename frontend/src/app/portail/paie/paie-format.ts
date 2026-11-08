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

/** `2026-12` -> `2027-01` : le mois contigu qui suit. */
export function periodeSuivante(periode: string): string {
  const [annee, mois] = periode.split('-').map(Number);
  return mois === 12 ? `${annee + 1}-01` : `${annee}-${String(mois + 1).padStart(2, '0')}`;
}

/** Le mois civil qui précède `date` (`2026-10` un jour de novembre 2026) : la RH importe toujours la paie du mois écoulé. */
export function moisCivilPrecedent(date: Date): string {
  const precedent = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${precedent.getFullYear()}-${String(precedent.getMonth() + 1).padStart(2, '0')}`;
}

/** Variation en pourcentage avec son signe et sa virgule française : `+3,1 %`, `-0,8 %`. */
export function formaterVariation(variation: number): string {
  const arrondie = Math.round(variation * 10) / 10;
  return `${arrondie > 0 ? '+' : ''}${arrondie.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Part en pourcentage, une décimale : `34,8 %`. */
export function formaterPart(part: number): string {
  return `${part.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Montant au format de l'application (`fr-FR`, deux décimales). */
export function formaterMontant(valeur: number): string {
  return FORMAT_MONTANT.format(valeur);
}

const FORMAT_ENTIER_ECART = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Un nombre de bulletins de paie : `1 bulletin`, `15 623 bulletins`. */
export function formaterBulletins(nombre: number): string {
  return `${FORMAT_ENTIER_ECART.format(nombre)} ${Math.abs(nombre) === 1 ? 'bulletin' : 'bulletins'}`;
}

/** Un montant en dirhams : `1 234,50 DH`. */
export function formaterDirhams(montant: number): string {
  return `${formaterMontant(montant)} DH`;
}

/**
 * Écart signé en unité puis en pourcentage : « +40 bulletins (+4,1 %) », « −8 765,43 DH (−0,2 %) ». Sans écart : « Stable ».
 * Sans base de comparaison (valeur précédente à zéro), le pourcentage n'existe pas : l'écart en unité seul, jamais une division par zéro.
 */
export function formaterEcart(courant: number, precedent: number, unite: (valeurAbsolue: number) => string): string {
  const difference = courant - precedent;
  if (difference === 0) {
    return 'Stable';
  }
  const enUnite = `${difference > 0 ? '+' : '−'}${unite(Math.abs(difference))}`;
  return precedent > 0 ? `${enUnite} (${formaterVariation((difference / precedent) * 100).replace('-', '−')})` : enUnite;
}
