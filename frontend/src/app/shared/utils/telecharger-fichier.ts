/** Propose un fichier reçu de l'API (`Blob`) au téléchargement du navigateur, sous le nom donné. */
export function telechargerFichier(blob: Blob, nom: string): void {
  const url = window.URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  window.URL.revokeObjectURL(url);
}
