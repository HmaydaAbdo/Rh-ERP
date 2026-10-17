package staport.rh.paie.dtos.response;

import java.math.BigDecimal;

/** Indicateurs du mois contigu, pour comparer une carte chantier ou équipe au même périmètre. */
public record PaiePeriodeComparaisonDto(
        String periode,
        long effectif,
        BigDecimal masse,
        long stc,
        BigDecimal stcMontant
) {
}
