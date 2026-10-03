package staport.rh.paie.dtos.response;

import java.math.BigDecimal;
import java.time.YearMonth;

public record PaieResponseDto(
        Long id,
        EmployeeSummaryDto employee,
        YearMonth periode,
        FunctionSummaryDto fonction,
        ChantierSummaryDto chantier,
        EquipeSummaryDto equipe,
        Integer nombreJoursTravailles,
        BigDecimal joursRecuperationOuvrable,
        BigDecimal joursRecuperationDimanche,
        BigDecimal salaireMensuel,
        BigDecimal primeRoulageOrdinaire,
        BigDecimal primeRoulageDimanche,
        BigDecimal salaireTotal,
        String observation
) {
}
