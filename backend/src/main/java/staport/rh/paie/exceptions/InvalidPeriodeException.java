package staport.rh.paie.exceptions;

/**
 * Levée quand un paramètre de période (aaaa-MM) fourni à un endpoint Paie est mal formé —
 * partagée entre import et export, qui prennent tous deux une période en paramètre.
 */
public class InvalidPeriodeException extends RuntimeException {

    public InvalidPeriodeException(String message) {
        super(message);
    }
}
