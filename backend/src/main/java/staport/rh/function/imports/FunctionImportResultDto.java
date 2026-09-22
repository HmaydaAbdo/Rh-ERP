package staport.rh.function.imports;

import java.util.List;

public record FunctionImportResultDto(
        int totalLignes,
        int crees,
        int ignores,
        List<LigneIgnoreeDto> lignesIgnorees
) {
    public record LigneIgnoreeDto(
            int numeroLigne,
            String libelle,
            String raison
    ) {
    }
}
