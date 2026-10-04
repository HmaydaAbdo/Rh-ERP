package staport.rh.audit.perimetre;

import org.springframework.stereotype.Component;

/** Périmètre par défaut de {@code @AuditableAction} : une opération unitaire n'a rien de plus à décrire. */
@Component
public class PerimetreAucun implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        return DescriptionPerimetre.AUCUNE;
    }
}
