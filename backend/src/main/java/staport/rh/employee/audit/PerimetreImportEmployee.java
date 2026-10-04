package staport.rh.employee.audit;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.audit.perimetre.DescriptionFichier;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.employee.imports.EmployeeImportResultDto;

import java.util.LinkedHashMap;
import java.util.Map;

/** Périmètre d'un import d'employés : le fichier ; un import dont des lignes sont rejetées est un échec. */
@Component
public class PerimetreImportEmployee implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>(DescriptionFichier.decrire((MultipartFile) arguments[0]));
        if (!(resultat instanceof EmployeeImportResultDto rapport)) {
            return DescriptionPerimetre.de(perimetre, null);
        }
        perimetre.put("totalLignes", rapport.totalLignes());
        if (rapport.ignores() > 0) {
            return DescriptionPerimetre.rejet(perimetre, 0, rapport.ignores() + " ligne(s) rejetée(s) sur " + rapport.totalLignes());
        }
        return DescriptionPerimetre.de(perimetre, rapport.crees());
    }
}
