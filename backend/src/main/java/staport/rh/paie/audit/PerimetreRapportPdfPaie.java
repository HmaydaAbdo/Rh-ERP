package staport.rh.paie.audit;

import org.springframework.stereotype.Component;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.paie.report.PaieReportPdfRequestDto;

import java.util.LinkedHashMap;
import java.util.Map;

/** Périmètre d'un rapport PDF de la paie : mois et filtres demandés — aucun contenu du rapport. */
@Component
public class PerimetreRapportPdfPaie implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>();
        perimetre.put("periode", String.valueOf(arguments[0]));
        perimetre.put("format", "PDF");
        if (arguments[1] instanceof PaieReportPdfRequestDto requete) {
            if (requete.chantierId() != null) {
                perimetre.put("chantierId", requete.chantierId());
            }
            if (requete.vueEnsembleRetiree()) {
                perimetre.put("sansVueEnsemble", true);
            }
            if (requete.fonctionId() != null) {
                perimetre.put("fonctionId", requete.fonctionId());
            }
            if (requete.nomPrenom() != null && !requete.nomPrenom().isBlank()) {
                perimetre.put("nomPrenom", requete.nomPrenom());
            }
            if (requete.cin() != null && !requete.cin().isBlank()) {
                perimetre.put("cin", requete.cin());
            }
        }
        return DescriptionPerimetre.de(perimetre, null);
    }
}
