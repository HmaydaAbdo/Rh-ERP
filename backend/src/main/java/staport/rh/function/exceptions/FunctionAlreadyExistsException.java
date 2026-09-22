package staport.rh.function.exceptions;

public class FunctionAlreadyExistsException extends RuntimeException {

    public FunctionAlreadyExistsException(String libelle) {
        super("Une fonction existe déjà avec le libellé : " + libelle);
    }
}
