package staport.rh.function.exceptions;

public class FunctionNotFoundException extends RuntimeException {

    public FunctionNotFoundException(Long id) {
        super("Fonction introuvable avec l'id : " + id);
    }
}
