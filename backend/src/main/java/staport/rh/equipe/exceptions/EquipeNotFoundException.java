package staport.rh.equipe.exceptions;

public class EquipeNotFoundException extends RuntimeException {

    public EquipeNotFoundException(Long id) {
        super("Équipe introuvable avec l'id : " + id);
    }
}
