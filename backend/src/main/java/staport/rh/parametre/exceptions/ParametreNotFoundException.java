package staport.rh.parametre.exceptions;

public class ParametreNotFoundException extends RuntimeException {

    public ParametreNotFoundException(Long id) {
        super("Paramètre introuvable avec l'id : " + id);
    }
}
