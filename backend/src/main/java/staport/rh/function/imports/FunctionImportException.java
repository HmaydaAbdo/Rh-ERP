package staport.rh.function.imports;

/**
 * Levée quand le fichier lui-même est illisible (mauvais format, fichier corrompu),
 * par opposition à une simple ligne ignorée (voir FunctionImportResultDto.LigneIgnoreeDto).
 */
public class FunctionImportException extends RuntimeException {

    public FunctionImportException(String message) {
        super(message);
    }
}
