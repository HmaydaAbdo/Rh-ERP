/** Texte comparable : sans accents ni casse (« Équipe » et « equipe » se valent), pour toutes les recherches côté client. */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** `texte` contient `recherche` (insensible à la casse et aux accents) ; une recherche vide correspond à tout. */
export function contient(texte: string | null | undefined, recherche: string): boolean {
  return normaliser(texte ?? '').includes(normaliser(recherche.trim()));
}
