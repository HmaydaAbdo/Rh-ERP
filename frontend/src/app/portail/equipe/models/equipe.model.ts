export interface Equipe {
  id: number;
  code: string;
  libelle: string;
}

export interface EquipeCreateRequest {
  code: string;
  libelle: string;
}

export type EquipeUpdateRequest = EquipeCreateRequest;

export interface EquipeSearchCriteria {
  code?: string;
  libelle?: string;
}
