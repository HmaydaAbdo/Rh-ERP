/**
 * Brouillon du formulaire « Nouveau bulletin » dans la conversation (KAN-310) : la saisie est gardée dans le navigateur
 * (`sessionStorage`, donc propre à l'onglet et effacée à sa fermeture) pour survivre à une fermeture accidentelle de la fenêtre
 * ou à un rechargement. Aucune donnée n'est envoyée au serveur ; le stockage peut être indisponible (navigation privée) : tout
 * est alors silencieusement ignoré.
 */
const CLE = 'staport-paie-brouillon';

/** Valeurs du brouillon : la période est une chaîne `AAAA-MM`, pas une date, pour tenir dans du JSON. */
export type BrouillonPaie = Record<string, string | number | null>;

export function lireBrouillon(): BrouillonPaie | null {
  try {
    const brut = sessionStorage.getItem(CLE);
    const valeur: unknown = brut ? JSON.parse(brut) : null;
    return valeur && typeof valeur === 'object' && !Array.isArray(valeur) ? (valeur as BrouillonPaie) : null;
  } catch {
    return null;
  }
}

export function ecrireBrouillon(brouillon: BrouillonPaie): void {
  try {
    sessionStorage.setItem(CLE, JSON.stringify(brouillon));
  } catch {
    // stockage indisponible ou plein : le brouillon est un confort, pas une garantie
  }
}

export function effacerBrouillon(): void {
  try {
    sessionStorage.removeItem(CLE);
  } catch {
    // voir ecrireBrouillon
  }
}
