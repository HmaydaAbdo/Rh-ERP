/** Nom de l'outil MCP qui prépare le classeur Excel de paie (KAN-266) ; le navigateur n'en dessine que le résultat. */
export const OUTIL_EXPORT_PAIE = 'paie_export_preparer';

/** Référence de téléchargement rendue par l'outil : valable 5 minutes, réservée à l'utilisateur connecté. */
export interface ExportPrepare {
  reference: string;
  nomFichier: string;
  periode: string;
}

function chercher(valeur: unknown, profondeur = 0): ExportPrepare | null {
  if (profondeur > 4 || valeur === null || valeur === undefined) {
    return null;
  }
  if (typeof valeur === 'string') {
    try {
      return chercher(JSON.parse(valeur), profondeur + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(valeur)) {
    for (const element of valeur) {
      const trouve = chercher(element, profondeur + 1);
      if (trouve) {
        return trouve;
      }
    }
    return null;
  }
  if (typeof valeur === 'object') {
    const objet = valeur as Record<string, unknown>;
    const telechargement = objet['telechargement'] as Record<string, unknown> | undefined;
    if (telechargement && typeof telechargement['reference'] === 'string') {
      return {
        reference: telechargement['reference'],
        nomFichier: typeof telechargement['nomFichier'] === 'string' ? telechargement['nomFichier'] : 'Paie_Export.xlsx',
        periode: typeof objet['periode'] === 'string' ? objet['periode'] : ''
      };
    }
    return chercher(objet['structuredContent'] ?? objet['text'] ?? objet['content'], profondeur + 1);
  }
  return null;
}

/** La référence portée par le résultat de l'outil (JSON direct, contenu MCP ou texte JSON), ou `null`. */
export function lireExportPrepare(resultat: unknown): ExportPrepare | null {
  return chercher(resultat);
}
