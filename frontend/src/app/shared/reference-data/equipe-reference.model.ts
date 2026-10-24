export interface EquipeReference {
  id: number;
  code: string;
  libelle: string;
}

/** Option synthétique pour filtrer ou laisser sans équipe; elle n'est jamais persistée comme une équipe. */
export const EQUIPE_ORPHELINE: EquipeReference = { id: 0, code: '', libelle: 'Orphelins (sans équipe)' };

/** L'option « Orphelins » reste trouvable avec les deux formulations employées dans les écrans métier. */
export function rechercheEquipeOrpheline(recherche: string): boolean {
  const terme = recherche.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!terme) return false;
  const libelle = EQUIPE_ORPHELINE.libelle.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return libelle.includes(terme) || terme.includes('orphelin') || terme.includes('sans equipe');
}
