package staport.rh.equipe.audit;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.audit.perimetre.DescriptionFichier;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.equipe.imports.EquipeImportResultDto;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PerimetreImportEquipe implements PerimetreAudit {
    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> details = new LinkedHashMap<>(DescriptionFichier.decrire((MultipartFile) arguments[0]));
        if (!(resultat instanceof EquipeImportResultDto rapport)) return DescriptionPerimetre.de(details, null);
        details.put("totalLignes", rapport.totalLignes());
        return rapport.ignores() > 0
                ? DescriptionPerimetre.rejet(details, 0, rapport.ignores() + " ligne(s) rejetée(s) sur " + rapport.totalLignes())
                : DescriptionPerimetre.de(details, rapport.crees());
    }
}
