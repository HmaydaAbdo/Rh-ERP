export interface Chantier {
  id: number;
  code: string;
  designation: string;
  sourceErp: boolean;
  actif: boolean;
}

export interface ChantierCreateRequest {
  code: string;
  designation: string;
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
