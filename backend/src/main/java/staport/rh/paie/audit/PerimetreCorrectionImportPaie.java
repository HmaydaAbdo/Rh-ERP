package staport.rh.paie.audit;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.audit.perimetre.DescriptionFichier;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.paie.imports.PaieImportCorrectionsDto;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Périmètre des corrections faites depuis l'assistant d'import : le fichier qui sert de référence, le mois, le nombre de
 * fiches alignées et d'employés créés. Les modifications et créations de fiches sont des actions imbriquées : elles
 * n'ont pas d'entrée à elles, chaque version de fiche est dans la révision de cette entrée.
 */
@Component
public class PerimetreCorrectionImportPaie implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>(DescriptionFichier.decrire((MultipartFile) arguments[0]));
        perimetre.put("periode", arguments[1] instanceof YearMonth periode ? periode.toString() : null);
        int nombre = 0;
        if (arguments[2] instanceof PaieImportCorrectionsDto corrections) {
            perimetre.put("fichesAlignees", corrections.aligner().size());
            perimetre.put("employesCrees", corrections.creer().size());
            nombre = corrections.aligner().size() + corrections.creer().size();
        }
        return DescriptionPerimetre.de(perimetre, nombre);
    }
}
