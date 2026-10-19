import { FunctionReference } from '../../../shared/reference-data/function-reference.model';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { EquipeReference } from '../../../shared/reference-data/equipe-reference.model';

export type EmployeeStatut = 'ACTIF' | 'INACTIF';

/** Un salaire mensuel, ou le tarif d'une journée. */
export type TypeSalaire = 'MENSUEL' | 'JOURNALIER';

export interface Employee {
  id: number;
  nomPrenom: string;
  cin: string;
  dateNaissance: string;
  dateEmbauche: string;
  fonction: Pick<FunctionReference, 'id' | 'libelle'>;
  chantier: Pick<ChantierReference, 'id' | 'code'>;
  /** État du dernier mois de paie : vides tant qu'aucune paie ne les a renseignés. Le salaire et son type ne sont envoyés
   * qu'à qui a `PAIE_READ` (null sinon). */
  equipe: Pick<EquipeReference, 'id' | 'code' | 'libelle'> | null;
  salaire: number | null;
  typeSalaire: TypeSalaire | null;
  statut: EmployeeStatut;
  version: number;
}

export interface EmployeeCreateRequest {
  nomPrenom: string;
  cin: string;
  dateNaissance: string;
  dateEmbauche: string;
  fonctionId: number;
  chantierId: number;
  equipeId: number | null;
  salaire: number | null;
  typeSalaire: TypeSalaire | null;
}

export interface EmployeeUpdateRequest extends EmployeeCreateRequest {
  statut: EmployeeStatut;
  version: number;
}

export interface EmployeeSearchCriteria {
  nomPrenom?: string;
  cin?: string;
  fonctionIds?: number[];
  chantierIds?: number[];
  equipeIds?: number[];
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

/** Ce par quoi la vue Cartes regroupe les employés. */
export type DimensionEmployes = 'CHANTIER' | 'EQUIPE' | 'FONCTION';

/** Un groupe de la vue Cartes ; pour l'équipe, `id` 0 = sans équipe. */
export interface EmployeeRegroupement {
  id: number;
  code: string | null;
  libelle: string;
  effectif: number;
  actifs: number;
}

/** Une tranche [min, max[ en années ; `max` null pour la dernière (« et plus »). */
export interface EmployeeTranche {
  min: number;
  max: number | null;
  effectif: number;
}

/** Chiffres clés des employés du périmètre (POST /employees/analytique). */
export interface EmployeeAnalytique {
  effectif: number;
  actifs: number;
  inactifs: number;
  ageMoyen: number | null;
  ancienneteMoyenne: number | null;
  embauchesDouzeMois: number;
  parAge: EmployeeTranche[];
  parAnciennete: EmployeeTranche[];
}
