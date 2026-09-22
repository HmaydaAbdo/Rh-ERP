package staport.rh.auth.exceptions;

public class EmailAlreadyExistsException extends RuntimeException {

    public EmailAlreadyExistsException(String email) {
        super("Cet email est déjà utilisé : " + email);
    }
}
