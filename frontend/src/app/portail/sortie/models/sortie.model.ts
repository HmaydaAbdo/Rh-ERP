/**
 * Un départ du mois (STC ou sortie) : le salarié, le motif enregistré, et le détail de son dernier bulletin au mois du départ
 * ou avant. Les champs de paie (`salaire`, `typeSalaire`, `joursTravailles`, `montantDernierBulletin`, `observation`) ne sont
 * rendus que pour un utilisateur qui a le droit de lire la paie ; l'affectation (`chantier`, `equipe`, `fonction`) l'est toujours.
 */
export interface Sortie {
  employeId: number;
  nomPrenom: string;
  cin: string;
  /** Mois du départ au format `aaaa-MM`. */
  periode: string;
  motif: string;
  /** Date d'embauche `aaaa-MM-jj`. */
  dateEmbauche?: string | null;
  /** Mois entiers entre l'embauche et le mois du départ. */
  ancienneteMois?: number | null;
  /** `INACTIF` : toujours sorti ; `ACTIF` : revenu en poste depuis. */
  statutActuel?: 'ACTIF' | 'INACTIF' | null;
  salaire?: number | null;
  typeSalaire?: 'MENSUEL' | 'JOURNALIER' | null;
  /** Fonction du dernier bulletin, sinon celle de la fiche. */
  fonction?: string | null;
  chantier?: string | null;
  chantierDesignation?: string | null;
  equipe?: string | null;
  /** Mois du dernier bulletin pris en compte (`aaaa-MM`). */
  dernierePaie?: string | null;
  joursTravailles?: number | null;
  montantDernierBulletin?: number | null;
  observation?: string | null;
}

/** Les sorties d'un mois, avec leur répartition par motif (`NON_PRECISE` quand aucun motif n'a été saisi). */
export interface SortiesMois {
  periode: string;
  nombre: number;
  parMotif: Record<string, number>;
  sorties: Sortie[];
}
