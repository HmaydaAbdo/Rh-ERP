package staport.rh.employee.dtos.request;

import staport.rh.employee.entities.EmployeeStatut;

public record EmployeeSearchCriteria(
        String nomPrenom,
        String cin,
        Long fonctionId,
        Long chantierId,
        EmployeeStatut statut
) {
}
