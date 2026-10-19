package staport.rh.paie.repositories;

import java.time.YearMonth;

/** Le strict nécessaire d'un bulletin pour suivre les effectifs mois par mois : qui, quand, où. */
public interface EffectifBulletinProjection {

    Long getEmployeId();

    YearMonth getPeriode();

    Long getChantierId();

    Long getFonctionId();

    /** {@code null} : sans équipe ce mois-là. */
    Long getEquipeId();
}
