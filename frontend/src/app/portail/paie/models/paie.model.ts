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

export type FormatExport = 'EXCEL' | 'PDF_SYNTHESE' | 'PDF_DETAILLE';

export type TypeRapportPdf = 'SYNTHESE' | 'DETAILLE';

/** Corps de POST /paie/report/pdf. Les trois champs équipe ne servent qu'en DETAILLE (ignorés en SYNTHESE). */
export interface PaieRapportPdfRequest {
  periode: string;
  typeRapport: TypeRapportPdf;
  feuillesEquipeMode?: FeuillesEquipeMode;
  equipesParChantier?: Record<string, string[]> | null;
  equipesExcluesFeuilleChantier?: Record<string, string[]> | null;
}
