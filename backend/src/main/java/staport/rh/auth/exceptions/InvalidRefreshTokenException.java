package staport.rh.auth.exceptions;

public class InvalidRefreshTokenException extends RuntimeException {

    public InvalidRefreshTokenException() {
        super("Refresh token invalide, expiré ou déjà utilisé.");
    }
}
