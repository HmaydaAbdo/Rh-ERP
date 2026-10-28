package staport.rh.heuresupp.repositories;

import java.math.BigDecimal;

/** Agrégat calculé par PostgreSQL pour éviter de charger toutes les lignes en mémoire. */
public interface HeuresSuppGroupeProjection {
    Long getId();
    String getCode();
    String getLibelle();
    Long getLignesHeures();
    Long getEffectif();
    BigDecimal getHeures();
    BigDecimal getMontantDh();
    BigDecimal getStcDh();
    BigDecimal getForfaitDh();
    BigDecimal getNetAPayerDh();
}
