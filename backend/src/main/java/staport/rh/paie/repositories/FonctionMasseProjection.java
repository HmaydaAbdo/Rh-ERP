package staport.rh.paie.repositories;

import java.math.BigDecimal;

/** Masse et effectif d'une fonction sur un mois (voir {@code PaieRepository.sommerParFonction}). */
public interface FonctionMasseProjection {

    Long getId();

    String getLibelle();

    BigDecimal getMasse();

    Long getEffectif();
}
