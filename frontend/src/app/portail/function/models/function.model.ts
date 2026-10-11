export interface Function {
  id: number;
  libelle: string;
  version: number;
}

export interface FunctionCreateRequest {
  libelle: string;
}

export interface FunctionUpdateRequest extends FunctionCreateRequest {
  version: number;
}

export interface FunctionSearchCriteria {
  libelle?: string;
}

export interface FunctionImportLigneIgnoree {
  numeroLigne: number;
  libelle: string;
  raison: string;
}

export interface FunctionImportResult {
  totalLignes: number;
  crees: number;
  ignores: number;
  lignesIgnorees: FunctionImportLigneIgnoree[];
}
