package staport.rh.parametre.exceptions;

/** Valeur refusée par le catalogue ({@code CleParametre}) : le message dit ce qui est attendu. */
public class ParametreInvalideException extends RuntimeException {

    public ParametreInvalideException(String message) {
        super(message);
    }
}
