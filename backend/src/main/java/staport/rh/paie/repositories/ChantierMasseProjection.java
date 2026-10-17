package staport.rh.paie.repositories;

import java.math.BigDecimal;

/** Masse, effectif et STC d'un chantier sur un mois (voir {@code PaieRepository.sommerParChantier}). */
public interface ChantierMasseProjection {

    Long getId();

    String getCode();

    String getNom();

    String getDesignation();

    BigDecimal getMasse();

    Long getEffectif();

    Long getStc();

    BigDecimal getStcMontant();
}
