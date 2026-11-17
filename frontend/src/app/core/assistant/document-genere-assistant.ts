/** Outils de l'agent qui créent un document (Word, PowerPoint, Excel, PDF) rangé dans l'espace de l'utilisateur. */
export const OUTILS_DOCUMENT = [
  'create_word_from_markdown',
  'create_powerpoint_presentation',
  'create_excel_from_markdown',
  'create_pdf_from_markdown',
  'export_workbook'
] as const;

/** Dossier de l'espace où le service IA range ces documents (`bureautique.py`). */
const DOSSIER_DOCUMENTS = '/espace/documents/';

/** Le texte rendu par l'outil, quelle que soit sa forme (texte, contenu MCP, enveloppe). */
function texteDe(valeur: unknown, profondeur = 0): string {
  if (profondeur > 4 || valeur === null || valeur === undefined) {
    return '';
  }
  if (typeof valeur === 'string') {
    return valeur;
  }
  if (Array.isArray(valeur)) {
    return valeur.map((element) => texteDe(element, profondeur + 1)).join(' ');
  }
  if (typeof valeur === 'object') {
    const objet = valeur as Record<string, unknown>;
    return texteDe(objet['text'] ?? objet['content'] ?? objet['resultat'], profondeur + 1);
  }
  return '';
}

/**
 * Le document que l'outil vient de ranger : « Fichier prêt : <nom> (N Ko). … » (`Bureautique._ranger`). `null` si
 * l'outil a échoué ou n'a rien rendu : aucun bouton n'est proposé.
 */
export function lireDocumentGenere(resultat: unknown): { nom: string; chemin: string } | null {
  const trouve = /Fichier prêt : ([^()\\/]+?) \(\d+ Ko\)/.exec(texteDe(resultat));
  return trouve ? { nom: trouve[1], chemin: `${DOSSIER_DOCUMENTS}${trouve[1]}` } : null;
}
