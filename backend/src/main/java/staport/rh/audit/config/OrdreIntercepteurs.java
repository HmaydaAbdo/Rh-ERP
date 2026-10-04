package staport.rh.audit.config;

import org.springframework.core.Ordered;

/**
 * Ordre explicite des intercepteurs de service (conventions/audit.md, « Aspect ») : la transaction métier
 * <strong>enveloppe</strong> l'aspect d'audit, qui s'exécute donc dans la transaction — son entrée de journal est
 * validée ou annulée avec les données. Un plus petit nombre s'exécute plus à l'extérieur.
 */
public final class OrdreIntercepteurs {

    public static final int TRANSACTION = Ordered.LOWEST_PRECEDENCE - 1000;
    public static final int AUDIT = Ordered.LOWEST_PRECEDENCE - 500;

    private OrdreIntercepteurs() {
    }
}
