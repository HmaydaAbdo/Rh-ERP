package staport.rh.audit.exceptions;

/** Le nom d'entité demandé pour un historique ne désigne aucune entité auditée. */
public class UnknownAuditEntityException extends RuntimeException {

    public UnknownAuditEntityException(String nom) {
        super("Entité auditée inconnue : " + nom);
    }
}
