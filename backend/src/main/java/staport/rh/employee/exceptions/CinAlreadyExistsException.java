package staport.rh.employee.exceptions;

public class CinAlreadyExistsException extends RuntimeException {

    public CinAlreadyExistsException(String cin) {
        super("Un employé existe déjà avec le CIN : " + cin);
    }
}
