package staport.rh.employee.imports;

/**
 * Levée quand le fichier lui-même est illisible ou ne respecte pas le format attendu
 * (colonnes manquantes, fichier corrompu) — par opposition à une simple ligne ignorée
 * (voir EmployeeImportResultDto.LigneIgnoreeDto).
 */
public class EmployeeImportException extends RuntimeException {

    public EmployeeImportException(String message) {
        super(message);
    }
}
