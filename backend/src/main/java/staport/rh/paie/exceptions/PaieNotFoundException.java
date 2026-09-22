package staport.rh.paie.exceptions;

public class PaieNotFoundException extends RuntimeException {

    public PaieNotFoundException(Long id) {
        super("Bulletin de paie introuvable avec l'id : " + id);
    }
}
