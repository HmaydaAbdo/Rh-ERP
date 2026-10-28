import { TypeSalaire } from '../../employee/models/employee.model';

export interface PaieEmployeeSummary {
  id: number;
  nomPrenom: string;
  cin: string;
}

export interface PaieFunctionSummary {
  id: number;
  libelle: string;
}

export interface PaieChantierSummary {
  id: number;
  code: string;
  designation: string;
}

export interface PaieEquipeSummary {
  id: number;
  code: string;
  libelle: string;
}

/** Un mois qui contient de la paie (GET /paie/periodes) — `periode` au format aaaa-MM. */
export interface PaiePeriodeResume {
  periode: string;
  nombreBulletins: number;
  nombreChantiers: number;
  masse: number;
  stc: number;
  stcMontant: number;
}

export interface PaieEquipePeriode {
  id: number;
  code: string;
  libelle: string;
  effectif: number;
  masse: number;
  stc: number;
  stcMontant: number;
  moisPrecedent?: PaiePeriodeComparaison | null;
}

export interface PaiePeriodeComparaison {
  periode: string;
  effectif: number;
  masse: number;
  stc: number;
  stcMontant: number;
}

/** Un chantier d'un mois avec ses équipes (GET /paie/chantiers) — `libelle` : nom, à défaut désignation. */
export interface PaieChantierPeriode {
  id: number;
  code: string;
  libelle: string | null;
  effectif: number;
  masse: number;
  stc: number;
  stcMontant: number;
  moisPrecedent?: PaiePeriodeComparaison | null;
  sansEquipeMoisPrecedent?: PaiePeriodeComparaison | null;
  equipes: PaieEquipePeriode[];
}

/** Un tableau du parc matériel (GET /paie/materiel) : ses lignes sont celles dont l'assistant d'export demande le nombre. */
export interface PaieMaterielTableau {
  chantierCode: string;
  equipeCode: string;
  titre: string;
  libelles: string[];
}

export interface Paie {
  id: number;
  version: number;
  employee: PaieEmployeeSummary;
  periode: string;
  fonction: PaieFunctionSummary;
  chantier: PaieChantierSummary;
  equipe: PaieEquipeSummary | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable: number | null;
  joursRecuperationDimanche: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire: number | null;
  primeRoulageDimanche: number | null;
  salaireTotal: number;
  observation: string | null;
}

export interface PaieCreateRequest {
  employeeId: number;
  periode: string;
  fonctionId: number;
  chantierId: number;
  equipeId?: number | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable?: number | null;
  joursRecuperationDimanche?: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire?: number | null;
  primeRoulageDimanche?: number | null;
  salaireTotal: number;
  observation?: string | null;
}

export interface PaieUpdateRequest {
  version: number;
  fonctionId: number;
  chantierId: number;
  equipeId?: number | null;
  nombreJoursTravailles: number;
  joursRecuperationOuvrable?: number | null;
  joursRecuperationDimanche?: number | null;
  salaireMensuel: number;
  primeRoulageOrdinaire?: number | null;
  primeRoulageDimanche?: number | null;
  salaireTotal: number;
  observation?: string | null;
}

export interface PaieSearchCriteria {
  cin?: string;
  nomPrenom?: string;
  periode?: string;
  fonctionIds?: number[];
  chantierIds?: number[];
  equipeIds?: number[];
}

export interface PaieKpi {
  masse: number;
  effectif: number;
  coutMoyen: number | null;
  nombreChantiers: number;
  stc: number;
  stcMontant: number;
}

export interface PaieChantierMasse {
  id: number;
  code: string;
  libelle: string | null;
  masse: number;
  effectif: number;
  stc: number;
  stcMontant: number;
}

export interface PaieEquipeMasse {
  id: number | null;
  code: string | null;
  libelle: string | null;
  masse: number;
  effectif: number;
  stc: number;
  stcMontant: number;
}

export interface PaieFonctionMasse {
  id: number;
  libelle: string;
  masse: number;
  effectif: number;
  stc: number;
  stcMontant: number;
}

/** Tranche de total : de `min` (inclus) à `max` (exclu) ; `max` est nul pour la dernière tranche, ouverte. */
export interface PaieTranche {
  min: number;
  max: number | null;
  effectif: number;
}

export interface PaieEvolution {
  periode: string;
  masse: number;
  effectif: number;
  stc: number;
  stcMontant: number;
}

/** Réponse de POST /paie/analytique. `moisPrecedent` est nul quand le mois contigu n'a aucun bulletin dans le périmètre. */
export interface PaieAnalytique {
  periode: string;
  kpis: PaieKpi;
  moisPrecedent: PaieKpi | null;
  parChantier: PaieChantierMasse[];
  parEquipe: PaieEquipeMasse[];
  parFonction: PaieFonctionMasse[];
  tranches: PaieTranche[];
  evolution: PaieEvolution[];
  qualite: { sansEquipe: number; sansObservation: number };
}

/** Suppression d'un groupe de bulletins (POST /paie/suppression) : ceux que décrivent `criteres` (mois obligatoire), à
 * condition que leur nombre soit encore `nombreAttendu` — celui que l'utilisateur a confirmé. */
export interface PaieSuppressionGroupeRequest {
  criteres: PaieSearchCriteria;
  nombreAttendu: number;
}

export interface PaieSuppression {
  supprimes: number;
}

export interface PaieRestauration {
  restaures: number;
}

export type FeuillesEquipeMode = 'AUCUNE' | 'TOUTES' | 'PERSONNALISE';

/** Les équipes sont désignées par leur CODE (clé stable, voir docs/equipe/README.md) — les valeurs
 * possibles par chantier viennent de PaieService.listerChantiersDeLaPeriode(). */
export interface PaieExportRequest {
  periode: string;
  feuillesEquipeMode: FeuillesEquipeMode;
  /** Utilisé uniquement en mode PERSONNALISE : chantier -> équipes pour lesquelles générer une sous-feuille. */
  equipesParChantier: Record<string, string[]> | null;
  /** Indépendant du mode ci-dessus : chantier -> équipes à exclure de la feuille globale de CE chantier. */
  equipesExcluesFeuilleChantier: Record<string, string[]> | null;
  /** Restreint tout l'export (y compris la feuille GLB) à ces chantiers ; null/vide = tous les chantiers. */
  chantiers: string[] | null;
  /** Nombre de chaque ligne du parc matériel (clé = libellé de la ligne) ; une ligne absente reste vide. */
  materiel: Record<string, number> | null;
}

/** Une ligne que seul le fichier peut corriger. */
export interface PaieImportErreur {
  numeroLigne: number;
  cin: string | null;
  nomPrenom: string | null;
  raison: string;
}

/** Un CIN sans fiche : à créer depuis l'assistant, ou à corriger dans le fichier. */
export interface PaieImportCinInconnu {
  numeroLigne: number;
  cin: string;
  nomPrenom: string | null;
  fonction: string | null;
  chantier: string | null;
  equipe: string | null;
  salaire: number;
}

/** Codes des champs comparés entre la fiche et le fichier. */
export type PaieImportChamp = 'nomPrenom' | 'fonction' | 'chantier' | 'equipe' | 'salaire';

/** Une fiche qui ne dit pas la même chose que sa ligne ; `typeSalaire` est le type actuel de la fiche. */
export interface PaieImportEcart {
  employeId: number;
  numeroLigne: number;
  cin: string;
  nomPrenom: string;
  champs: { champ: PaieImportChamp; base: string | null; fichier: string | null }[];
  typeSalaire: TypeSalaire | null;
}

/** Un départ proposé : STC ou sortie du fichier (`motif` « STC » / « Sortie »), ou actif absent du fichier (`motif` null). */
export interface PaieImportDepart {
  employeId: number;
  cin: string;
  nomPrenom: string;
  motif: string | null;
}

/** Ce que l'analyse d'un fichier de paie a trouvé, sans rien enregistrer (POST /paie/import/analyse). */
/** Un chantier clôturé cité par des lignes du fichier : à rouvrir, ou à corriger dans le fichier. */
export interface PaieImportChantierCloture {
  chantierId: number;
  code: string;
  designation: string;
  lignes: number[];
}

export interface PaieImportAnalyse {
  periode: string;
  totalLignes: number;
  erreurs: PaieImportErreur[];
  chantiersClotures: PaieImportChantierCloture[];
  cinInconnus: PaieImportCinInconnu[];
  ecarts: PaieImportEcart[];
  departs: PaieImportDepart[];
  retours: { employeId: number; cin: string; nomPrenom: string }[];
  pret: boolean;
}

/** Corrections des fiches depuis l'assistant (POST /paie/import/corrections). */
export interface PaieImportCorrections {
  aligner: { employeId: number; typeSalaire: TypeSalaire | null }[];
  creer: { numeroLigne: number; dateNaissance: string; dateEmbauche: string; typeSalaire: TypeSalaire }[];
}

/** Bilan d'un import réussi (POST /paie/import). */
export interface PaieImportResult {
  periode: string;
  crees: number;
  departs: number;
  retours: number;
}

/** Corps de POST /paie/report/pdf — rapport BI RH/Paie (voir docs/report/README.md), pas un export
 * tabulaire (voir PaieExportRequest pour celui-ci). Le périmètre reprend exactement les filtres de
 * la page Paie (PaieSearchCriteria, sans pagination) : periode obligatoire, le reste optionnel.
 *
 * `equipesParChantier` : même forme et même sélection que PaieExportRequest.equipesParChantier
 * (demande explicite de direction, 2026-09-29 : export PDF/Excel unifiés derrière un seul dialog,
 * une seule sélection manuelle d'équipes à détailler) — un chantier absent de cette map n'a aucune
 * équipe détaillée séparément dans le PDF, tous ses employés sont réunis dans une seule section. */
export interface PaieRapportPdfRequest {
  periode: string;
  nomPrenom?: string | null;
  cin?: string | null;
  fonctionId?: number | null;
  /** Marchés retenus pour le rapport ; absent, nul ou vide = tous les marchés. */
  chantierIds?: number[] | null;
  /** Retire le chapitre « Vue d'ensemble » : le rapport commence par le premier chantier. */
  sansVueEnsemble?: boolean;
  equipesParChantier?: Record<string, string[]> | null;
  /** Nombre de chaque ligne du parc matériel (clé = libellé de la ligne) ; une ligne absente reste vide. */
  materiel?: Record<string, number> | null;
}

/** Événement du parcours d'un employé, au mois où la paie le constate. */
export type PaieParcoursEvenementType =
  | 'ENTREE'
  | 'CHANGEMENT_CHANTIER'
  | 'CHANGEMENT_FONCTION'
  | 'CHANGEMENT_EQUIPE'
  | 'CHANGEMENT_SALAIRE'
  | 'DEPART'
  | 'RETOUR';

/** Parcours d'un employé tel que sa paie le raconte (GET /paie/employes/{id}/parcours), du plus récent au plus ancien. */
export interface PaieParcours {
  employeId: number;
  indicateurs: { moisPayes: number; totalPercu: number; joursTravailles: number; premierMois: string | null; dernierMois: string | null };
  mois: {
    bulletinId: number;
    periode: string;
    fonction: string;
    chantier: string;
    equipe: string | null;
    nombreJoursTravailles: number;
    salaireMensuel: number;
    salaireTotal: number;
    observation: string | null;
  }[];
  evenements: { periode: string; type: PaieParcoursEvenementType; avant: string | null; apres: string | null; motif: string | null }[];
}

/** Indicateurs de mouvements mensuels (POST /paie/effectifs) ; comparaisons null si le mois précédent manque. */
export interface PaieEffectifMois {
  periode: string;
  effectif: number;
  effectifMoisPrecedent: number | null;
  variation: number | null;
  entrees: number | null;
  plusPayes: number | null;
  sorties: number;
  mutations: number | null;
}
