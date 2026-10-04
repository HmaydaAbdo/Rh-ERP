export type CategorieAudit = 'OPERATION' | 'SECURITE' | 'ACCES';
export type ResultatAudit = 'SUCCES' | 'ECHEC';
export type OrigineAudit = 'API' | 'TACHE_PLANIFIEE' | 'DEMARRAGE' | 'MIGRATION' | 'INCONNUE';
export type TypeOperation = 'CREATE' | 'UPDATE' | 'DELETE';

/** Une ligne de la liste du journal. */
export interface AuditLigne {
  id: number;
  horodatage: string;
  categorie: CategorieAudit;
  action: string;
  typeOperation: TypeOperation | null;
  resultat: ResultatAudit;
  utilisateurId: number | null;
  utilisateurNom: string;
  origine: OrigineAudit;
  entiteType: string | null;
  entiteId: number | null;
  nombreElements: number | null;
  motif: string | null;
}

/** Une entrée du journal avec son contexte complet et son périmètre. */
export interface AuditEntree extends AuditLigne {
  requestId: string | null;
  adresseIp: string | null;
  userAgent: string | null;
  perimetre: Record<string, unknown> | null;
  revisionId: number | null;
}

/** Un champ qui change ; une collection de droits a des éléments ajoutés et retirés plutôt qu'un avant / après. */
export interface AuditChamp {
  champ: string;
  avant: string | null;
  apres: string | null;
  ajoutes: string[] | null;
  retires: string[] | null;
}

export type OperationAudit = 'AJOUT' | 'MODIFICATION' | 'SUPPRESSION';

export interface AuditChangement {
  entiteType: string;
  entiteId: number;
  libelle: string | null;
  operation: OperationAudit;
  champs: AuditChamp[];
}

export interface AuditVersion {
  revision: number;
  horodatage: string;
  utilisateurId: number | null;
  utilisateurNom: string;
  origine: OrigineAudit;
  requestId: string | null;
  operation: OperationAudit;
  champs: AuditChamp[];
}

export interface AuditCriteres {
  dateDebut?: string;
  dateFin?: string;
  utilisateur?: string;
  categorie?: CategorieAudit;
  action?: string;
  resultat?: ResultatAudit;
  entiteType?: string;
  entiteId?: number;
  requestId?: string;
}
