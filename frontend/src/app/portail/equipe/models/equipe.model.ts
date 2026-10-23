export interface Equipe {
  id: number;
  code: string;
  libelle: string;
  version: number;
}

export interface EquipeCreateRequest {
  code: string;
  libelle: string;
}

export interface EquipeUpdateRequest extends EquipeCreateRequest {
  version: number;
}

export interface EquipeImportLigneIgnoree {
  numeroLigne: number;
  code: string;
  libelle: string;
  raison: string;
}

export interface EquipeImportResult {
  totalLignes: number;
  crees: number;
  ignores: number;
  lignesIgnorees: EquipeImportLigneIgnoree[];
}

export interface EquipeSearchCriteria {
  code?: string;
  libelle?: string;
}
