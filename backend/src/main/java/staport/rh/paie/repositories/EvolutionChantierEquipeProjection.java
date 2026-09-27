package staport.rh.paie.repositories;

import java.math.BigDecimal;
import java.time.YearMonth;

/** Projection JPQL agrégée (masse + effectif + STC) d'un triplet (chantier, équipe, mois) — la donnée
 * la plus fine dont le rapport PDF BI a besoin ; les évolutions globale et par chantier en sont
 * dérivées en Java par simple somme, jamais par une requête séparée (voir
 * {@code PaieRepository.sommerParChantierEquipePeriode}). {@code equipe} est la valeur brute en base
 * (peut être {@code null}/vide, voir {@code PaieBiReportBuilder.libelleEquipe} pour le mapping vers
 * "Sans équipe"). */
public interface EvolutionChantierEquipeProjection {

    String getChantierCode();

    String getEquipe();

    YearMonth getPeriode();

    BigDecimal getMasse();

    Long getEffectif();

    Long getStc();
}
