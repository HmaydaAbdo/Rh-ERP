package staport.rh.paie.exceptions;

import java.time.YearMonth;

public class PaieAlreadyExistsException extends RuntimeException {

    public PaieAlreadyExistsException(Long employeeId, YearMonth periode) {
        super("Un bulletin de paie existe déjà pour l'employé id=" + employeeId + " sur la période " + periode);
    }
}
