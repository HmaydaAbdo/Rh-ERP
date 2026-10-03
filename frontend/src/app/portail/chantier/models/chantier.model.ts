export interface Chantier {
  id: number;
  code: string;
  designation: string;
  /** Optionnel, jamais exposé ni modifié par la synchronisation ERP (voir designation) — uniquement
   * saisi/modifié manuellement. Affiché par le rapport PDF/l'export Excel de la paie sous la forme
   * "CHANTIER : <nom> (<code>)" quand renseigné (le nom prime, code en repli sinon). */
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
  dejaPresents: number;
  ignores: number;
}
