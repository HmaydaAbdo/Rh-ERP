package staport.rh.paie.audit;

import org.springframework.stereotype.Component;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.paie.export.PaieExportRequestDto;

import java.util.LinkedHashMap;
import java.util.Map;

/** Périmètre d'un export Excel de la paie : mois, mode des feuilles d'équipe, chantiers demandés — aucun contenu. */
@Component
public class PerimetreExportExcelPaie implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>();
        perimetre.put("periode", String.valueOf(arguments[0]));
        perimetre.put("format", "EXCEL");
        if (arguments[1] instanceof PaieExportRequestDto requete) {
            perimetre.put("feuillesEquipeMode", requete.feuillesEquipeMode());
            perimetre.put("chantiers", requete.chantiers() == null || requete.chantiers().isEmpty() ? "TOUS" : requete.chantiers());
        }
        return DescriptionPerimetre.de(perimetre, null);
    }
}
