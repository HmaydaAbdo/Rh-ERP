import { FunctionReference } from '../../../shared/reference-data/function-reference.model';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';

export type EmployeeStatut = 'ACTIF' | 'INACTIF';

export interface Employee {
  id: number;
  nomPrenom: string;
  cin: string;
  dateNaissance: string;
  dateEmbauche: string;
  fonction: Pick<FunctionReference, 'id' | 'libelle'>;
  chantier: Pick<ChantierReference, 'id' | 'code'>;
  statut: EmployeeStatut;
}

export interface EmployeeCreateRequest {
  nomPrenom: string;
  cin: string;
  dateNaissance: string;
  dateEmbauche: string;
  fonctionId: number;
  chantierId: number;
}

export interface EmployeeUpdateRequest extends EmployeeCreateRequest {
  statut: EmployeeStatut;
}

export interface EmployeeSearchCriteria {
  nomPrenom?: string;
  cin?: string;
  fonctionIds?: number[];
  chantierIds?: number[];
  statut?: EmployeeStatut;
}

export interface EmployeeImportLigneIgnoree {
  numeroLigne: number;
  cin: string | null;
  nomPrenom: string | null;
  raison: string;
}

export interface EmployeeImportResult {
  totalLignes: number;
  crees: number;
  ignores: number;
  lignesIgnorees: EmployeeImportLigneIgnoree[];
}
