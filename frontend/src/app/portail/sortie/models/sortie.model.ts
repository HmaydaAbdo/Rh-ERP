/** Une sortie du mois : le salarié, et le motif enregistré à l'import de la paie. */
export interface Sortie {
  employeId: number;
  nomPrenom: string;
  cin: string;
  /** Mois au format `aaaa-MM`. */
  periode: string;
  motif: string;
}

/** Les sorties d'un mois, avec leur répartition par motif (`NON_PRECISE` quand aucun motif n'a été saisi). */
export interface SortiesMois {
  periode: string;
  nombre: number;
  parMotif: Record<string, number>;
  sorties: Sortie[];
}
