package staport.rh.audit.dtos.response;

import java.math.BigDecimal;
import java.time.YearMonth;

/** Valeurs métier conservées par Envers pour recréer un bulletin supprimé ; son ancien identifiant ne sera pas réutilisé. */
public record PaieRestaurationInstantane(
        Long ancienId,
        Long employeeId,
        YearMonth periode,
        Long fonctionId,
        Long chantierId,
        Long equipeId,
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
