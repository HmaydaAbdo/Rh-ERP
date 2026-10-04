package staport.rh.audit.exceptions;

public class AuditEntryNotFoundException extends RuntimeException {

    public AuditEntryNotFoundException(Long id) {
        super("Entrée de journal introuvable avec l'id : " + id);
    }
}
