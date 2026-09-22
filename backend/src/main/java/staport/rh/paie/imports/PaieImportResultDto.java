package staport.rh.paie.imports;

import java.time.YearMonth;
import java.util.List;

public record PaieImportResultDto(
        YearMonth periode,
        int totalLignes,
        int crees,
        int misAJour,
        int ignores,
        List<LigneIgnoreeDto> lignesIgnorees,
        List<String> fonctionsCreees
) {
    public record LigneIgnoreeDto(
            int numeroLigne,
            String cin,
            String nomPrenom,
            String raison
    ) {
    }
}
