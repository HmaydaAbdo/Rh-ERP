package staport.rh.paie.repositories;

import java.math.BigDecimal;

/** Masse, effectif et STC d'une équipe sur un mois ; l'équipe peut être {@code null} pour « Sans équipe ». */
public interface EquipeMasseProjection {

    Long getId();

    String getCode();

    String getLibelle();

    BigDecimal getMasse();

    Long getEffectif();

    Long getStc();

    BigDecimal getStcMontant();
}
