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

export interface PaieEquipeSummary {
  id: number;
  code: string;
  libelle: string;
}

/** Un mois qui contient de la paie (GET /paie/periodes) — `periode` au format aaaa-MM. */
export interface PaiePeriodeResume {
  periode: string;
  nombreBulletins: number;
  nombreChantiers: number;
  masse: number;
  stc: number;
}

export interface PaieEquipePeriode {
  id: number;
  code: string;
  libelle: string;
  effectif: number;
}

/** Un chantier d'un mois avec ses équipes (GET /paie/chantiers) — `libelle` : nom, à défaut désignation. */
export interface PaieChantierPeriode {
  code: string;
  libelle: string | null;
  effectif: number;
  masse: number;
  equipes: PaieEquipePeriode[];
}

/** Un tableau du parc matériel (GET /paie/materiel) : ses lignes sont celles dont l'assistant d'export demande le nombre. */
export interface PaieMaterielTableau {
  chantierCode: string;
  equipeCode: string;
  titre: string;
  libelles: string[];
}

export interface Paie {
  id: number;
  employee: PaieEmployeeSummary;
  periode: string;
  fonction: PaieFunctionSummary;
  chantier: PaieChantierSummary;
  equipe: PaieEquipeSummary | null;
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
  equipeId?: number | null;
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
  equipeId?: number | null;
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
  fonctionIds?: number[];
  chantierIds?: number[];
  equipeIds?: number[];
}

export type FeuillesEquipeMode = 'AUCUNE' | 'TOUTES' | 'PERSONNALISE';

/** Les équipes sont désignées par leur CODE (clé stable, voir docs/equipe/README.md) — les valeurs
 * possibles par chantier viennent de PaieService.listerChantiersDeLaPeriode(). */
export interface PaieExportRequest {
  periode: string;
  feuillesEquipeMode: FeuillesEquipeMode;
  /** Utilisé uniquement en mode PERSONNALISE : chantier -> équipes pour lesquelles générer une sous-feuille. */
  equipesParChantier: Record<string, string[]> | null;
  /** Indépendant du mode ci-dessus : chantier -> équipes à exclure de la feuille globale de CE chantier. */
  equipesExcluesFeuilleChantier: Record<string, string[]> | null;
  /** Restreint tout l'export (y compris la feuille GLB) à ces chantiers ; null/vide = tous les chantiers. */
  chantiers: string[] | null;
  /** Nombre de chaque ligne du parc matériel (clé = libellé de la ligne) ; une ligne absente reste vide. */
  materiel: Record<string, number> | null;
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
  ignores: number;
  lignesIgnorees: PaieImportLigneIgnoree[];
  fonctionsCreees: string[];
}

/** Corps de POST /paie/report/pdf — rapport BI RH/Paie (voir docs/report/README.md), pas un export
 * tabulaire (voir PaieExportRequest pour celui-ci). Le périmètre reprend exactement les filtres de
 * la page Paie (PaieSearchCriteria, sans pagination) : periode obligatoire, le reste optionnel.
 *
 * `equipesParChantier` : même forme et même sélection que PaieExportRequest.equipesParChantier
 * (demande explicite de direction, 2026-09-29 : export PDF/Excel unifiés derrière un seul dialog,
 * une seule sélection manuelle d'équipes à détailler) — un chantier absent de cette map n'a aucune
 * équipe détaillée séparément dans le PDF, tous ses employés sont réunis dans une seule section. */
export interface PaieRapportPdfRequest {
  periode: string;
  nomPrenom?: string | null;
  cin?: string | null;
  fonctionId?: number | null;
  chantierId?: number | null;
  equipesParChantier?: Record<string, string[]> | null;
  /** Nombre de chaque ligne du parc matériel (clé = libellé de la ligne) ; une ligne absente reste vide. */
  materiel?: Record<string, number> | null;
}
