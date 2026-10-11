package staport.rh.paie.audit;

import org.springframework.stereotype.Component;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;

import java.util.Map;

/** Périmètre de restauration : référence l'entrée source sans dupliquer les données salariales dans le journal. */
@Component
public class PerimetreRestaurationGroupePaie implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        long nombre = resultat instanceof Number valeur ? valeur.longValue() : 0;
        return DescriptionPerimetre.de(Map.of("entreeAuditSourceId", arguments[0]), Math.toIntExact(nombre));
    }
}
