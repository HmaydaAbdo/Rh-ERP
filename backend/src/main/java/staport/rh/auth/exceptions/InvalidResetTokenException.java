package staport.rh.auth.exceptions;

public class InvalidResetTokenException extends RuntimeException {

    public InvalidResetTokenException() {
        super("Lien de réinitialisation invalide, expiré ou déjà utilisé.");
    }
}
