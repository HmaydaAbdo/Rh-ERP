package staport.rh.paie.audit;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.audit.perimetre.DescriptionFichier;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.paie.imports.PaieImportResultDto;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Périmètre d'un import de paie : le fichier (nom, taille, empreinte), le mois, puis le bilan — bulletins créés, départs
 * enregistrés, employés revenus. Un fichier qui n'est pas prêt est refusé par une exception : l'aspect l'inscrit en échec.
 */
@Component
public class PerimetreImportPaie implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>(DescriptionFichier.decrire((MultipartFile) arguments[0]));
        perimetre.put("periode", arguments[1] instanceof YearMonth periode ? periode.toString() : null);
        if (!(resultat instanceof PaieImportResultDto bilan)) {
            return DescriptionPerimetre.de(perimetre, null);
        }
        perimetre.put("departs", bilan.departs());
        perimetre.put("retours", bilan.retours());
        return DescriptionPerimetre.de(perimetre, bilan.crees());
    }
}
