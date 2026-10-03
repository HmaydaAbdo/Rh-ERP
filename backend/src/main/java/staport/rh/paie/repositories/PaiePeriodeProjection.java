package staport.rh.paie.repositories;

import java.math.BigDecimal;
import java.time.YearMonth;

/** Agrégat d'un mois (voir {@code PaieRepository.resumerParPeriode}). {@code stc} reproduit la définition de
 * {@code ObservationStc.estStcOuSortie}. */
public interface PaiePeriodeProjection {

    YearMonth getPeriode();

    Long getBulletins();

    Long getChantiers();

    BigDecimal getMasse();

    Long getStc();
}
