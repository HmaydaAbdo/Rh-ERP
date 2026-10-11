package staport.rh.employee.dtos.response;

import staport.rh.employee.entities.EmployeeStatut;

import java.time.LocalDate;

public record EmployeeResponseDto(
        Long id,
        Long version,
        String nomPrenom,
        String cin,
        LocalDate dateNaissance,
        LocalDate dateEmbauche,
        FunctionSummaryDto fonction,
        ChantierSummaryDto chantier,
        EmployeeStatut statut
) {
}
