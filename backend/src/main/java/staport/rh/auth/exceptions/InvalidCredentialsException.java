package staport.rh.auth.exceptions;

public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException() {
        super("Identifiants invalides.");
    }
}
