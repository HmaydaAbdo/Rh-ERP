package staport.rh.equipe.exceptions;

public class EquipeAlreadyExistsException extends RuntimeException {

    private EquipeAlreadyExistsException(String message) {
        super(message);
    }

    public static EquipeAlreadyExistsException parCode(String code) {
        return new EquipeAlreadyExistsException("Une équipe existe déjà avec le code : " + code);
    }

    public static EquipeAlreadyExistsException parLibelle(String libelle) {
        return new EquipeAlreadyExistsException("Une équipe existe déjà avec le libellé : " + libelle);
    }
}
