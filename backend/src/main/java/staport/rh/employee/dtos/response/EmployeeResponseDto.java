package staport.rh.employee.dtos.response;

import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.entities.TypeSalaire;

import java.math.BigDecimal;
import java.time.LocalDate;

/** {@code equipe}, {@code salaire} et {@code typeSalaire} sont {@code null} tant qu'aucune paie ne les a renseignés. */
public record EmployeeResponseDto(
        Long id,
        Long version,
        String nomPrenom,
        String cin,
        LocalDate dateNaissance,
        LocalDate dateEmbauche,
        FunctionSummaryDto fonction,
        ChantierSummaryDto chantier,
        EquipeSummaryDto equipe,
        BigDecimal salaire,
        TypeSalaire typeSalaire,
        EmployeeStatut statut
) {
}
