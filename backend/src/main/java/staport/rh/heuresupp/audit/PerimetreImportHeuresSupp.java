package staport.rh.heuresupp.audit;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.audit.perimetre.DescriptionFichier;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.heuresupp.imports.HeuresSuppImportForfaitsDto;
import staport.rh.heuresupp.imports.HeuresSuppImportResultDto;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PerimetreImportHeuresSupp implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> donnees = new LinkedHashMap<>(DescriptionFichier.decrire((MultipartFile) arguments[0]));
        donnees.put("periode", arguments[1] instanceof YearMonth periode ? periode.toString() : null);
        donnees.put("chantierId", arguments[2]);
        donnees.put("forfaits", arguments[3] instanceof HeuresSuppImportForfaitsDto dto ? dto.forfaits().size() : 0);
        if (resultat instanceof HeuresSuppImportResultDto bilan) {
            donnees.put("heures", bilan.lignesHeures());
            donnees.put("forfaitsSeuls", bilan.forfaitsSeuls());
            donnees.put("remplacements", bilan.remplacements());
            donnees.put("netTotalDh", bilan.netTotalDh());
        }
        return DescriptionPerimetre.de(donnees, resultat instanceof HeuresSuppImportResultDto bilan ? bilan.lignesHeures() + bilan.forfaitsSeuls() : null);
    }
}
