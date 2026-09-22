package staport.rh.employee.imports;

import java.util.List;

public record EmployeeImportResultDto(
        int totalLignes,
        int crees,
        int misAJour,
        int ignores,
        List<LigneIgnoreeDto> lignesIgnorees
) {
    public record LigneIgnoreeDto(
            int numeroLigne,
            String cin,
            String nomPrenom,
            String raison
    ) {
    }
}
