package staport.rh.paie.exceptions;

/**
 * Levée quand un bulletin de paie référence un employé, une fonction ou un chantier inexistant.
 */
public class InvalidReferenceException extends RuntimeException {

    public InvalidReferenceException(String message) {
        super(message);
    }
}
