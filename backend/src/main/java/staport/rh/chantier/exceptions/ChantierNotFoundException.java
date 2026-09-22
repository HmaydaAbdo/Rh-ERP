package staport.rh.chantier.exceptions;

public class ChantierNotFoundException extends RuntimeException {

    public ChantierNotFoundException(Long id) {
        super("Chantier introuvable avec l'id : " + id);
    }
}
