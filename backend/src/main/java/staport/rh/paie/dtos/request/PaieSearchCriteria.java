package staport.rh.paie.dtos.request;

import java.time.YearMonth;

public record PaieSearchCriteria(
        String cin,
        String nomPrenom,
        YearMonth periode,
        Long fonctionId,
        Long chantierId,
        String equipe
) {
}
