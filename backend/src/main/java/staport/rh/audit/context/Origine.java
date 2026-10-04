package staport.rh.audit.context;

/**
 * D'où vient une écriture ou un événement d'audit. {@link #INCONNUE} n'est jamais posée volontairement :
 * elle rend visible une écriture faite hors de tout contexte d'audit (un oubli de {@link BatchAuditContext}
 * dans un traitement hors requête) plutôt que de l'attribuer à tort à une origine connue.
 */
public enum Origine {
    /** Requête HTTP d'un utilisateur (ou d'un visiteur non authentifié : connexion, mot de passe oublié). */
    API,
    /** Traitement planifié, sans utilisateur (voir {@link BatchAuditContext}). */
    TACHE_PLANIFIEE,
    /** Initialisation de l'application (compte administrateur de départ). */
    DEMARRAGE,
    /** Migration de base de données (gabarit de conventions/database.md). */
    MIGRATION,
    INCONNUE
}
