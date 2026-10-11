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

export interface EquipeSearchCriteria {
  code?: string;
  libelle?: string;
}
