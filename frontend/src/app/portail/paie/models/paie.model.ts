export interface PaieEmployeeSummary {
  id: number;
  nomPrenom: string;
  cin: string;
}

export interface PaieFunctionSummary {
  id: number;
  libelle: string;
}

export interface PaieChantierSummary {
  id: number;
  code: string;
  designation: string;
}

export interface Paie {
  id: number;
  employee: PaieEmployeeSummary;
  periode: string;
  fonction: PaieFunctionSummary;
  chantier: PaieChantierSummary;
  equipe: string | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable: number | null;
  joursRecuperationDimanche: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire: number | null;
  primeRoulageDimanche: number | null;
  salaireTotal: number;
  observation: string | null;
}

export interface PaieCreateRequest {
  employeeId: number;
  periode: string;
  fonctionId: number;
  chantierId: number;
  equipe?: string | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable?: number | null;
  joursRecuperationDimanche?: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire?: number | null;
  primeRoulageDimanche?: number | null;
  salaireTotal: number;
  observation?: string | null;
}

export interface PaieUpdateRequest {
  fonctionId: number;
  chantierId: number;
  equipe?: string | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable?: number | null;
  joursRecuperationDimanche?: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire?: number | null;
  primeRoulageDimanche?: number | null;
  salaireTotal: number;
  observation?: string | null;
}

export interface PaieSearchCriteria {
  cin?: string;
  nomPrenom?: string;
  periode?: string;
  fonctionId?: number;
  chantierId?: number;
  equipe?: string;
}

export type FeuillesEquipeMode = 'AUCUNE' | 'TOUTES' | 'PERSONNALISE';

/** Aucun référentiel Équipe dédié (texte libre sur chaque bulletin, voir docs/paie/README.md) —
 * les valeurs possibles par chantier viennent de PaieService.listerEquipes(). */
export interface PaieExportRequest {
  periode: string;
  feuillesEquipeMode: FeuillesEquipeMode;
  /** Utilisé uniquement en mode PERSONNALISE : chantier -> équipes pour lesquelles générer une sous-feuille. */
  equipesParChantier: Record<string, string[]> | null;
  /** Indépendant du mode ci-dessus : chantier -> équipes à exclure de la feuille globale de CE chantier. */
  equipesExcluesFeuilleChantier: Record<string, string[]> | null;
  /** Restreint tout l'export (y compris la feuille GLB) à ces chantiers ; null/vide = tous les chantiers. */
  chantiers: string[] | null;
}

export interface PaieImportLigneIgnoree {
  numeroLigne: number;
  cin: string | null;
  nomPrenom: string | null;
  raison: string;
}

export interface PaieImportResult {
  periode: string;
  totalLignes: number;
  crees: number;
  misAJour: number;
  ignores: number;
  lignesIgnorees: PaieImportLigneIgnoree[];
  fonctionsCreees: string[];
}

/** Corps de POST /paie/report/pdf — rapport BI RH/Paie (voir docs/report/README.md), pas un export
 * tabulaire (voir PaieExportRequest pour celui-ci). Le périmètre reprend exactement les filtres de
 * la page Paie (PaieSearchCriteria, sans pagination) : periode obligatoire, le reste optionnel. */
export interface PaieRapportPdfRequest {
  periode: string;
  nomPrenom?: string | null;
  cin?: string | null;
  fonctionId?: number | null;
  chantierId?: number | null;
}
