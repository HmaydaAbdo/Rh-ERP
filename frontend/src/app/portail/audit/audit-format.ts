import { CategorieAudit, OperationAudit, OrigineAudit, ResultatAudit } from './models/audit.model';

/** Heure de l'entreprise : l'audit est stocké en UTC, affiché à l'heure de Casablanca (conventions/audit.md). */
const FORMAT_HORODATAGE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Africa/Casablanca'
});

export function formaterHorodatage(instant: string | null | undefined): string {
  return instant ? FORMAT_HORODATAGE.format(new Date(instant)) : '';
}

/** Libellés lisibles des actions du journal ; une action inconnue (ajoutée plus tard) s'affiche par son code. */
const LIBELLES_ACTIONS: Record<string, string> = {
  PAIE_CREATION: 'Bulletin créé',
  PAIE_MODIFICATION: 'Bulletin modifié',
  PAIE_SUPPRESSION: 'Bulletin supprimé',
  PAIE_SUPPRESSION_GROUPE: 'Suppression en groupe de bulletins',
  PAIE_IMPORT: 'Import de bulletins',
  PAIE_IMPORT_CORRECTION: 'Fiches corrigées depuis l’import de paie',
  PAIE_EXPORT_EXCEL: 'Export Excel de la paie',
  PAIE_RAPPORT_PDF: 'Rapport PDF de la paie',
  PAIE_RESTAURATION_GROUPE: 'Restauration en groupe de bulletins',
  EMPLOYE_CREATION: 'Employé créé',
  EMPLOYE_MODIFICATION: 'Employé modifié',
  EMPLOYE_SUPPRESSION: 'Employé supprimé',
  EMPLOYE_IMPORT: 'Import d’employés',
  EMPLOYE_SORTIE: 'Départ d’employés enregistré',
  FONCTION_CREATION: 'Fonction créée',
  FONCTION_MODIFICATION: 'Fonction modifiée',
  FONCTION_SUPPRESSION: 'Fonction supprimée',
  FONCTION_IMPORT: 'Import de fonctions',
  CHANTIER_CREATION: 'Chantier créé',
  CHANTIER_MODIFICATION: 'Chantier modifié',
  CHANTIER_SUPPRESSION: 'Chantier supprimé',
  CHANTIER_SYNCHRONISATION: 'Synchronisation des chantiers',
  EQUIPE_CREATION: 'Équipe créée',
  EQUIPE_MODIFICATION: 'Équipe modifiée',
  EQUIPE_SUPPRESSION: 'Équipe supprimée',
  UTILISATEUR_CREATION: 'Compte créé',
  UTILISATEUR_MODIFICATION: 'Compte modifié',
  UTILISATEUR_PERMISSIONS_REFUSEES: 'Permissions refusées modifiées',
  ROLE_CREATION: 'Rôle créé',
  ROLE_MODIFICATION: 'Rôle modifié',
  ROLE_SUPPRESSION: 'Rôle supprimé',
  PERMISSION_CREATION: 'Permission créée',
  PARAMETRE_MODIFICATION: 'Paramètre modifié',
  LECTURE_METIER: 'Lecture métier',
  ECRITURE_HTTP_SANS_TRACE_METIER: 'Écriture HTTP sans trace métier',
  TENTATIVE_HTTP_REJETEE: 'Tentative HTTP rejetée',
  TENTATIVE_ECRITURE_HTTP_REJETEE: 'Tentative d’écriture métier rejetée',
  AUDIT_ETAT_INITIAL: 'État initial de l’audit',
  CONNEXION_REUSSIE: 'Connexion réussie',
  CONNEXION_ECHOUEE: 'Connexion échouée',
  COMPTE_BLOQUE_TEMPORAIREMENT: 'Compte temporairement bloqué',
  SESSION_RENOUVELEE: 'Session renouvelée',
  SESSION_RENOUVELLEMENT_REFUSE: 'Renouvellement de session refusé',
  SESSIONS_REVOQUEES: 'Sessions révoquées',
  DECONNEXION: 'Déconnexion',
  JETON_REUTILISE: 'Jeton de session réutilisé (vol présumé)',
  MOT_DE_PASSE_OUBLIE: 'Mot de passe oublié demandé',
  MOT_DE_PASSE_REINITIALISE: 'Mot de passe réinitialisé (lien)',
  MOT_DE_PASSE_REINITIALISE_PAR_ADMIN: 'Mot de passe réinitialisé par un administrateur',
  ACCES_REFUSE: 'Accès refusé',
  ACCES_ANONYME_REFUSE: 'Accès anonyme refusé'
};

export const ACTIONS_AUDIT: { code: string; libelle: string }[] = Object.entries(LIBELLES_ACTIONS).map(([code, libelle]) => ({
  code,
  libelle
}));

export function libelleAction(code: string): string {
  return LIBELLES_ACTIONS[code] ?? code;
}

export const LIBELLES_CATEGORIES: Record<CategorieAudit, string> = {
  OPERATION: 'Opération',
  SECURITE: 'Sécurité',
  ACCES: 'Sortie de données'
};

export const LIBELLES_RESULTATS: Record<ResultatAudit, string> = { SUCCES: 'Succès', ECHEC: 'Échec' };

export const LIBELLES_ORIGINES: Record<OrigineAudit, string> = {
  API: 'Application',
  TACHE_PLANIFIEE: 'Tâche planifiée',
  DEMARRAGE: 'Démarrage',
  MIGRATION: 'Migration',
  INCONNUE: 'Inconnue'
};

export const LIBELLES_OPERATIONS: Record<OperationAudit, string> = {
  AJOUT: 'Ajout',
  MODIFICATION: 'Modification',
  SUPPRESSION: 'Suppression'
};

/** Entités auditées, par le nom que porte le journal (filtre « Entité ») et que le serveur attend pour un historique. */
export const ENTITES_AUDITEES: { code: string; libelle: string }[] = [
  { code: 'Paie', libelle: 'Bulletin de paie' },
  { code: 'Employee', libelle: 'Employé' },
  { code: 'Function', libelle: 'Fonction' },
  { code: 'Chantier', libelle: 'Chantier' },
  { code: 'Equipe', libelle: 'Équipe' },
  { code: 'Utilisateur', libelle: 'Compte' },
  { code: 'Role', libelle: 'Rôle' },
  { code: 'Parametre', libelle: 'Paramètre' }
];

export function libelleEntite(code: string | null): string {
  return ENTITES_AUDITEES.find((e) => e.code === code)?.libelle ?? code ?? '';
}

const LIBELLES_CHAMPS: Record<string, string> = {
  employee: 'Employé',
  periode: 'Mois',
  fonction: 'Fonction',
  chantier: 'Chantier',
  equipe: 'Équipe',
  nombreJoursTravailles: 'Jours travaillés',
  joursRecuperationOuvrable: 'Jours de récupération (ouvrable)',
  joursRecuperationDimanche: 'Jours de récupération (dimanche)',
  salaireMensuel: 'Salaire mensuel',
  primeRoulageOrdinaire: 'Prime de roulage ordinaire',
  primeRoulageDimanche: 'Prime de roulage dimanche',
  salaireTotal: 'Salaire total',
  observation: 'Observation',
  nomPrenom: 'Nom et prénom',
  cin: 'CIN',
  dateNaissance: 'Date de naissance',
  dateEmbauche: 'Date d’embauche',
  statut: 'Statut',
  salaire: 'Salaire',
  typeSalaire: 'Type de salaire',
  motif: 'Motif',
  libelle: 'Libellé',
  code: 'Code',
  designation: 'Désignation',
  nom: 'Nom',
  sourceErp: 'Source ERP',
  actif: 'Actif',
  username: 'Identifiant',
  email: 'Adresse e-mail',
  description: 'Description',
  roles: 'Rôles',
  permissions: 'Permissions',
  permissionsRefusees: 'Permissions refusées'
};

export function libelleChamp(champ: string): string {
  return LIBELLES_CHAMPS[champ] ?? champ;
}
