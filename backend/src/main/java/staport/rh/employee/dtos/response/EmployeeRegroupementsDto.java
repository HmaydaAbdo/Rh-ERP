package staport.rh.employee.dtos.response;

import java.util.List;

/** Résultat métier d'une répartition d'employés, triée selon le critère demandé et complète pour le périmètre autorisé. */
public record EmployeeRegroupementsDto(int nombreGroupes, List<EmployeeRegroupementDto> groupes) {
}
