package staport.rh.auth.exceptions;

public class RoleAlreadyExistsException extends RuntimeException {

    public RoleAlreadyExistsException(String nom) {
        super("Ce rôle existe déjà : " + nom);
    }
}
