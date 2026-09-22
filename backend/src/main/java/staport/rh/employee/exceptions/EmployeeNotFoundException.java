package staport.rh.employee.exceptions;

public class EmployeeNotFoundException extends RuntimeException {

    public EmployeeNotFoundException(Long id) {
        super("Employé introuvable avec l'id : " + id);
    }
}
