export interface HeuresSupp {
  id: number;
  version: number;
  employeeId: number;
  nomPrenom: string;
  cin: string;
  fonction: string;
  chantierId: number;
  codeChantier: string;
  chantier: string;
  periode: string;
  salaireHoraireDh: number | null;
  heuresSupplementaires: number | null;
  montantDh: number;
  stcOuSortie: boolean;
  stcDh: number;
  forfaitDh: number | null;
  netAPayerDh: number;
}

export interface HeuresSuppSearchCriteria {
  periode?: string;
  chantierIds?: number[];
  equipeIds?: number[];
  fonctionIds?: number[];
  cin?: string;
  nomPrenom?: string;
}

export interface HeuresSuppGroupe {
  id: number;
  code: string | null;
  libelle: string;
  lignesHeures: number;
  effectif: number;
  heures: number;
  montantDh: number;
  stcDh: number;
  forfaitDh: number;
  netAPayerDh: number;
}

export interface HeuresSuppAnalytique {
  periode: string;
  indicateurs: {
    employes: number;
    lignesHeures: number;
    heures: number;
    montantDh: number;
    stcDh: number;
    forfaitDh: number;
    netAPayerDh: number;
  };
  parChantier: HeuresSuppGroupe[];
  parEquipe: HeuresSuppGroupe[];
  parFonction: HeuresSuppGroupe[];
}

export interface HeuresSuppImportPrerequis {
  periode: string;
  chantierId: number;
  bulletins: number;
  pret: boolean;
  message: string | null;
}

export interface HeuresSuppImportLigne {
  numeroLigne: number;
  cin: string;
  nomPrenom: string | null;
  fonction: string | null;
  employeId: number | null;
  nomFichier: string | null;
  fonctionFichier: string | null;
  identiteEcart: boolean;
  fonctionEcart: boolean;
  forfaitSeul: boolean;
  heuresSupplementaires: number | null;
  salaireHoraireDh: number | null;
  montantDh: number;
  stcOuSortie: boolean;
  stcDh: number;
  forfaitDh: number | null;
  netAPayerDh: number;
  erreurs: string[];
}

export interface HeuresSuppImportAnalyse {
  periode: string;
  chantierId: number;
  totalLignes: number;
  lignesZero: number;
  lignes: HeuresSuppImportLigne[];
  erreurs: string[];
  pret: boolean;
}

export interface HeuresSuppImportResult {
  periode: string;
  chantierId: number;
  lignesHeures: number;
  lignesZero: number;
  forfaitsSeuls: number;
  remplacements: number;
  heuresTotales: number;
  montantTotalDh: number;
  stcTotalDh: number;
  forfaitTotalDh: number;
  netTotalDh: number;
}

export interface HeuresSuppImportForfait { cin: string; montantDh: number; }
export interface HeuresSuppCreationEmploye {
  numeroLigne: number;
  dateNaissance: string;
  dateEmbauche: string;
  fonctionId: number;
  salaire: number;
  typeSalaire: 'JOURNALIER' | 'MENSUEL';
}
export interface HeuresSuppImportCorrections {
  aligner: { employeId: number }[];
  creer: HeuresSuppCreationEmploye[];
}
