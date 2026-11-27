import { FunctionReference } from '../../../shared/reference-data/function-reference.model';
import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { EquipeReference } from '../../../shared/reference-data/equipe-reference.model';

export type EmployeeStatut = 'ACTIF' | 'INACTIF';

/** Civilité imprimée sur les documents administratifs (attestation de travail) : Monsieur ou Madame. */
export type Civilite = 'MONSIEUR' | 'MADAME';

/** Format d'un document administratif : le PDF à imprimer, ou le Word à retoucher avant impression. */
export type FormatDocument = 'PDF' | 'WORD';

export const CIVILITE_OPTIONS: { label: string; value: Civilite }[] = [
  { label: 'Monsieur', value: 'MONSIEUR' },
  { label: 'Madame', value: 'MADAME' }
];

/** Un salaire mensuel, ou le tarif d'une journée. */
export type TypeSalaire = 'MENSUEL' | 'JOURNALIER';

export interface Employee {
  id: number;
  nomPrenom: string;
  cin: string;
  dateNaissance: string;
  dateEmbauche: string;
  fonction: Pick<FunctionReference, 'id' | 'libelle'>;
  chantier: Pick<ChantierReference, 'id' | 'code'> | null;
  /** État du dernier mois de paie : vides tant qu'aucune paie ne les a renseignés. Le salaire et son type ne sont envoyés
   * qu'à qui a `PAIE_READ` (null sinon). */
  equipe: Pick<EquipeReference, 'id' | 'code' | 'libelle'> | null;
  salaire: number | null;
  typeSalaire: TypeSalaire | null;
  statut: EmployeeStatut;
  version: number;
  /** Déclaration CNSS (matricule, date) et civilité : facultatives, utilisées par les documents administratifs. */
  matriculeCnss: string | null;
  dateDeclarationCnss: string | null;
  civilite: Civilite | null;
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
  matriculeCnss: string | null;
  dateDeclarationCnss: string | null;
  civilite: Civilite | null;
}

export interface EmployeeUpdateRequest extends Omit<EmployeeCreateRequest, 'chantierId'> {
  chantierId: number | null;
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

/** Un groupe de la vue Cartes ; pour l'équipe, `id` 0 = orphelins. */
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

/** Résultat de l'import des déclarations CNSS : atomique, une ligne refusée n'écrit rien. */
export interface CnssImportResult {
  totalLignes: number;
  misAJour: number;
  inchanges: number;
  sansDeclaration: number;
  ignores: number;
  lignesIgnorees: EmployeeImportLigneIgnoree[];
}
