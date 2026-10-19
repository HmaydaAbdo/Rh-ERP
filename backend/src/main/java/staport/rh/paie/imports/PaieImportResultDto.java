package staport.rh.paie.imports;

import java.time.YearMonth;

/** Bilan d'un import réussi : les bulletins créés, les départs enregistrés, les employés revenus (repassés ACTIF). */
public record PaieImportResultDto(
        YearMonth periode,
        int crees,
        int departs,
        int retours
) {
}
