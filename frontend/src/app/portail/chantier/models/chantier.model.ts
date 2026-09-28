export interface Chantier {
  id: number;
  code: string;
  designation: string;
  /** Optionnel, jamais exposé ni modifié par la synchronisation ERP (voir designation) — uniquement
   * saisi/modifié manuellement. Affiché par le rapport PDF/l'export Excel de la paie sous la forme
   * "CHANTIER : <code> (<nom>)" quand renseigné. */
  nom: string | null;
  sourceErp: boolean;
  actif: boolean;
}

export interface ChantierCreateRequest {
  code: string;
  designation: string;
  nom?: string | null;
}

export interface ChantierUpdateRequest extends ChantierCreateRequest {
  actif: boolean;
}

export interface ChantierSearchCriteria {
  code?: string;
  designation?: string;
  actif?: boolean;
}

export interface ChantierSyncResult {
  totalRecus: number;
  crees: number;
  misAJour: number;
  ignores: number;
}
