package staport.rh.paie.repositories;

import java.math.BigDecimal;

/** Agrégat d'un mois sur un périmètre filtré (voir {@code PaieRepository.resumerKpi}). {@code stc} reproduit la
 * définition de {@code ObservationStc.estStcOuSortie} ; {@code sansObservation} compte les observations nulles ou vides. */
public interface PaieKpiProjection {

    Long getEffectif();

    BigDecimal getMasse();

    Long getChantiers();

    Long getStc();

    BigDecimal getStcMontant();

    Long getSansEquipe();

    Long getSansObservation();
}
