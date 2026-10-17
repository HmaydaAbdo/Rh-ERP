package staport.rh.paie.repositories;

import java.math.BigDecimal;
import java.time.YearMonth;

/** Masse et effectif d'un mois sur un périmètre filtré (voir {@code PaieRepository.sommerParPeriode}). */
public interface EvolutionMasseProjection {

    YearMonth getPeriode();

    BigDecimal getMasse();

    Long getEffectif();

    Long getStc();

    BigDecimal getStcMontant();
}
