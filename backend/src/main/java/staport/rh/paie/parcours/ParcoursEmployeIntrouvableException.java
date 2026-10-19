package staport.rh.paie.parcours;

public class ParcoursEmployeIntrouvableException extends RuntimeException {

    public ParcoursEmployeIntrouvableException(Long employeId) {
        super("Employé introuvable avec l'id : " + employeId);
    }
}
