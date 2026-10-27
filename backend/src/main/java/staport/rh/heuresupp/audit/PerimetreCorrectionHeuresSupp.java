package staport.rh.heuresupp.audit;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.audit.perimetre.DescriptionFichier;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.heuresupp.imports.HeuresSuppImportCorrectionsDto;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PerimetreCorrectionHeuresSupp implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> donnees = new LinkedHashMap<>(DescriptionFichier.decrire((MultipartFile) arguments[0]));
        donnees.put("periode", arguments[1] instanceof YearMonth periode ? periode.toString() : null);
        donnees.put("chantierId", arguments[2]);
        int crees = arguments[3] instanceof HeuresSuppImportCorrectionsDto corrections ? corrections.creer().size() : 0;
        donnees.put("employesCrees", crees);
        return DescriptionPerimetre.de(donnees, crees);
    }
}
