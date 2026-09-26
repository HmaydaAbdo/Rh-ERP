package staport.rh.paie.repositories;

import java.math.BigDecimal;
import java.time.YearMonth;

/** Projection JPQL agrégée (masse + effectif) d'un mois — alimente le graphique d'évolution du
 * rapport PDF BI (voir {@code PaieBiReportBuilder.evolutionMensuelle}). Une projection par interface
 * évite de charger les entités {@code Paie} complètes juste pour une somme et un comptage. */
public interface EvolutionMensuelleProjection {

    YearMonth getPeriode();

    BigDecimal getMasse();

    Long getEffectif();
}
