package staport.rh.audit.entities;

/** Les trois sortes d'entrées du journal d'audit (conventions/audit.md, « Journal d'audit »). */
public enum CategorieAudit {
    /** Opération métier qui écrit (création, modification, suppression, import, synchronisation…). */
    OPERATION,
    /** Événement de sécurité : connexion, refus d'accès, jeton réutilisé, mot de passe… */
    SECURITE,
    /** Consultation métier ou sortie de données : lecture API, export, rapport. */
    ACCES
}
