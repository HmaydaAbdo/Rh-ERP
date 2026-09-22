package staport.rh.auth.exceptions;

public class RoleNotFoundException extends RuntimeException {

    public RoleNotFoundException(Long id) {
        super("Rôle introuvable avec l'id : " + id);
    }
}
