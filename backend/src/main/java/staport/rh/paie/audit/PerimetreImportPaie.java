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
 * Périmètre d'un import de paie : le fichier (nom, taille, empreinte), le mois, les fonctions créées au passage. L'import
 * qui rejette des lignes <strong>ne lève pas d'exception</strong> (il renvoie le détail des lignes refusées) : c'est ce
 * périmètre qui le déclare en échec.
 */
@Component
public class PerimetreImportPaie implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>(DescriptionFichier.decrire((MultipartFile) arguments[0]));
        perimetre.put("periode", arguments[1] instanceof YearMonth periode ? periode.toString() : null);
        if (!(resultat instanceof PaieImportResultDto rapport)) {
            return DescriptionPerimetre.de(perimetre, null);
        }
        perimetre.put("totalLignes", rapport.totalLignes());
        perimetre.put("fonctionsCreees", rapport.fonctionsCreees().size());
        if (rapport.ignores() > 0) {
            return DescriptionPerimetre.rejet(perimetre, 0, rapport.ignores() + " ligne(s) rejetée(s) sur " + rapport.totalLignes());
        }
        return DescriptionPerimetre.de(perimetre, rapport.crees());
    }
}
