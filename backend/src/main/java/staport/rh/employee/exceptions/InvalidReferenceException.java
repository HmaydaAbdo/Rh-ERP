package staport.rh.employee.exceptions;

/**
 * Levée quand une fiche employé référence une fonction ou un chantier inexistant.
 */
public class InvalidReferenceException extends RuntimeException {

    public InvalidReferenceException(String message) {
        super(message);
    }
}
