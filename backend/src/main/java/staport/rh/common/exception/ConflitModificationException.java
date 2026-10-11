package staport.rh.common.exception;

/** Échec d'une écriture demandée avec une version qui n'est plus la version courante. */
public class ConflitModificationException extends RuntimeException {

    public ConflitModificationException() {
        super("L'enregistrement a été modifié depuis son chargement. Rechargez-le avant de réessayer.");
    }
}
