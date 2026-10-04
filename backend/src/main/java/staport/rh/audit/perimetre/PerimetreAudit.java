package staport.rh.audit.perimetre;

/**
 * Décrit, pour le journal d'audit, le périmètre d'une opération de masse ou d'un export à partir des paramètres de la
 * méthode et de son résultat (pattern Strategy, conventions/audit.md). Une implémentation par opération, dans le
 * module concerné, déclarée {@code @Component}.
 *
 * <p>{@code resultat} vaut {@code null} quand la méthode a échoué : la description doit alors se limiter à ce que les
 * paramètres permettent de dire (le périmètre demandé reste utile pour une tentative refusée).
 */
public interface PerimetreAudit {

    DescriptionPerimetre decrire(Object[] arguments, Object resultat);
}
