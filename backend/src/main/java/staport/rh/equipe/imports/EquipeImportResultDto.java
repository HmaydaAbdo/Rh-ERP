package staport.rh.equipe.imports;

import java.util.List;

public record EquipeImportResultDto(
        int totalLignes,
        int crees,
        int ignores,
        List<LigneIgnoreeDto> lignesIgnorees
) {
    public record LigneIgnoreeDto(int numeroLigne, String code, String libelle, String raison) {
    }
}
