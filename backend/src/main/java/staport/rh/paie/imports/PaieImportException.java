package staport.rh.paie.imports;

/**
 * Levée quand le fichier lui-même est illisible ou ne respecte pas le format attendu, ou quand la
 * période fournie est invalide — par opposition à une simple ligne ignorée
 * (voir PaieImportResultDto.LigneIgnoreeDto).
 */
public class PaieImportException extends RuntimeException {

    public PaieImportException(String message) {
        super(message);
    }
}
