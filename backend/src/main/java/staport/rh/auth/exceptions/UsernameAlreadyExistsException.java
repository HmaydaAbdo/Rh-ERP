package staport.rh.auth.exceptions;

public class UsernameAlreadyExistsException extends RuntimeException {

    public UsernameAlreadyExistsException(String username) {
        super("Ce nom d'utilisateur est déjà utilisé : " + username);
    }
}
