package staport.rh.paie.repositories;

import java.math.BigDecimal;

/** Agrégat d'un couple (chantier, équipe) sur un mois (voir
 * {@code PaieRepository.resumerChantiersEtEquipesParPeriode}). Les champs d'équipe sont nuls pour les bulletins
 * sans équipe. */
public interface ChantierEquipePeriodeProjection {

    Long getChantierId();

    String getChantierCode();

    String getChantierNom();

    String getChantierDesignation();

    Long getEquipeId();

    String getEquipeCode();

    String getEquipeLibelle();

    Long getEffectif();

    BigDecimal getMasse();
}
