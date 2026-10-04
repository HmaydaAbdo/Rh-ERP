package staport.rh.chantier.audit;

import org.springframework.stereotype.Component;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.chantier.sync.ChantierSyncResultDto;

import java.util.LinkedHashMap;
import java.util.Map;

/** Périmètre d'une synchronisation des chantiers : ce que l'ERP a envoyé et ce qui en a été fait. */
@Component
public class PerimetreSynchronisationChantier implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        if (!(resultat instanceof ChantierSyncResultDto bilan)) {
            return DescriptionPerimetre.AUCUNE;
        }
        Map<String, Object> perimetre = new LinkedHashMap<>();
        perimetre.put("recus", bilan.totalRecus());
        perimetre.put("dejaPresents", bilan.dejaPresents());
        perimetre.put("ignores", bilan.ignores());
        return DescriptionPerimetre.de(perimetre, bilan.crees());
    }
}
