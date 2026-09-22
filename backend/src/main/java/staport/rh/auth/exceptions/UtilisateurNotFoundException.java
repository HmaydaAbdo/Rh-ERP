package staport.rh.auth.exceptions;

public class UtilisateurNotFoundException extends RuntimeException {

    public UtilisateurNotFoundException(Long id) {
        super("Utilisateur introuvable avec l'id : " + id);
    }
}
