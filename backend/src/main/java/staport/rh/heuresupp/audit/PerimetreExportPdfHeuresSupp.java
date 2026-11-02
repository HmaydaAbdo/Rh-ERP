package staport.rh.heuresupp.audit;

import org.springframework.stereotype.Component;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.heuresupp.export.HeuresSuppExportRequestDto;

import java.util.LinkedHashMap;
import java.util.Map;

/** Périmètre d'un rapport PDF des heures supplémentaires : mois et filtres demandés, jamais le contenu du rapport. */
@Component
public class PerimetreExportPdfHeuresSupp implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>();
        perimetre.put("format", "PDF");
        if (arguments[0] instanceof HeuresSuppExportRequestDto requete) {
            perimetre.put("periode", requete.periode() == null ? null : requete.periode().toString());
            if (requete.chantierIds() != null && !requete.chantierIds().isEmpty()) perimetre.put("chantierIds", requete.chantierIds());
            if (requete.equipeIds() != null && !requete.equipeIds().isEmpty()) perimetre.put("equipeIds", requete.equipeIds());
            if (requete.fonctionIds() != null && !requete.fonctionIds().isEmpty()) perimetre.put("fonctionIds", requete.fonctionIds());
            if ((requete.nomPrenom() != null && !requete.nomPrenom().isBlank()) || (requete.cin() != null && !requete.cin().isBlank())) {
                perimetre.put("filtreEmployeNominatif", true);
            }
            perimetre.put("tri", requete.tri());
        }
        return DescriptionPerimetre.de(perimetre, null);
    }
}
