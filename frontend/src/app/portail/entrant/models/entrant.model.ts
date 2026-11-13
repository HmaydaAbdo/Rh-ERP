/** `NOUVELLE_EMBAUCHE` : aucun bulletin avant ce mois. `RETOUR` : déjà payé auparavant, absent le mois civil précédent. */
export type TypeEntree = 'NOUVELLE_EMBAUCHE' | 'RETOUR';

/**
 * Un entrant du mois : payé ce mois-ci et pas le mois civil précédent (même définition que les mouvements de la paie). Les
 * champs de paie (`salaire`, `typeSalaire`, `joursTravailles`, `montantBulletin`, `observation`) ne sont rendus que pour un
 * utilisateur qui a le droit de lire la paie ; l'affectation du mois l'est toujours.
 */
export interface Entrant {
  employeId: number;
  nomPrenom: string;
  cin: string;
  /** Mois d'entrée au format `aaaa-MM`. */
  periode: string;
  type: TypeEntree;
  /** Date d'embauche `aaaa-MM-jj`. */
  dateEmbauche?: string | null;
  statutActuel?: 'ACTIF' | 'INACTIF' | null;
  fonctionId: number;
  fonction: string;
  chantierId: number;
  chantier: string;
  chantierDesignation?: string | null;
  equipeId?: number | null;
  equipe?: string | null;
  /** Dernier chantier payé avant ce mois, pour un retour ; vide pour une nouvelle embauche. */
  chantierPrecedent?: string | null;
  dernierePaiePrecedente?: string | null;
  salaire?: number | null;
  typeSalaire?: 'MENSUEL' | 'JOURNALIER' | null;
  joursTravailles?: number | null;
  montantBulletin?: number | null;
  observation?: string | null;
}

/**
 * Les entrants d'un mois selon les filtres. `comparable` est faux quand le mois ou le mois civil précédent n'a aucun bulletin :
 * on ne peut alors pas dire qui entre, la liste est vide.
 */
export interface EntrantsMois {
  periode: string;
  comparable: boolean;
  nombre: number;
  nouvellesEmbauches: number;
  retours: number;
  entrants: Entrant[];
}
