package staport.rh.paie.exceptions;

/** Un autre domaine s'appuie sur ce bulletin : sa suppression est refusée. */
public class PaieLieeException extends RuntimeException {

    public PaieLieeException(String message) {
        super(message);
    }
}
