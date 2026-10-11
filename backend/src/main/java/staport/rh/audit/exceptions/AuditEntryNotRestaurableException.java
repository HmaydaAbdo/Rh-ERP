package staport.rh.audit.exceptions;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/** L'entrée ne désigne pas une suppression de groupe réussie dont les instantanés sont encore disponibles. */
@ResponseStatus(HttpStatus.CONFLICT)
public class AuditEntryNotRestaurableException extends RuntimeException {

    public AuditEntryNotRestaurableException(Long id) {
        super("L'entrée d'audit " + id + " ne correspond pas à une suppression de groupe restaurable.");
    }
}
