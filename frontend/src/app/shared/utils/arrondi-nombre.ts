/** Arrondi HALF_DOWN : une demi exactement revient vers zéro, toute autre fraction vers l'entier le plus proche. */
export function arrondirDemiBas(valeur: number, decimales = 0): number {
  const echelle = 10 ** decimales;
  const absolue = Math.abs(valeur * echelle);
  const plancher = Math.floor(absolue);
  const arrondi = (absolue - plancher > 0.5 + 1e-9 ? plancher + 1 : plancher) / echelle;
  return Math.sign(valeur) * arrondi;
}
