package staport.rh.paie.repositories;

import java.math.BigDecimal;
import java.time.YearMonth;

/** Projection JPQL agrégée (masse + effectif + STC, en montant ET en effectif) d'un triplet
 * (chantier, équipe, mois) — la donnée la plus fine dont le rapport PDF BI a besoin ; les évolutions
 * globale et par chantier en sont dérivées en Java par simple somme, jamais par une requête séparée
 * (voir {@code PaieRepository.sommerParChantierEquipePeriode}). {@code equipe} est le code de l'équipe
 * (peut être {@code null} pour un bulletin sans équipe, voir {@code PaieBiReportBuilder.libelleEquipe}
 * pour le mapping vers "Sans équipe"). */
public interface EvolutionChantierEquipeProjection {

    String getChantierCode();

    String getEquipe();

    YearMonth getPeriode();

    BigDecimal getMasse();

    Long getEffectif();

    Long getStc();

    BigDecimal getStcMontant();
}
