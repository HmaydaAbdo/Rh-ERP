package staport.rh.chantier.exceptions;

public class ChantierAlreadyExistsException extends RuntimeException {

    public ChantierAlreadyExistsException(String code) {
        super("Un chantier existe déjà avec le code : " + code);
    }
}
