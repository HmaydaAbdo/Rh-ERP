package staport.rh.heuresupp.imports;

import java.math.BigDecimal;
import java.time.YearMonth;

public record HeuresSuppImportResultDto(
        YearMonth periode,
        Long chantierId,
        int lignesHeures,
        int lignesZero,
        int forfaitsSeuls,
        int remplacements,
        BigDecimal heuresTotales,
        BigDecimal montantTotalDh,
        BigDecimal stcTotalDh,
        BigDecimal forfaitTotalDh,
        BigDecimal netTotalDh
) {
}
