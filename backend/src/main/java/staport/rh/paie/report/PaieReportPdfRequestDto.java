package staport.rh.paie.report;

import staport.rh.paie.reporting.FeuillesEquipeMode;

import java.util.List;
import java.util.Map;

/**
 * Configuration du rapport PDF : période, type de rapport, et — uniquement pour
 * {@code TypeRapport.DETAILLE} — la même configuration de feuilles/exclusions équipe que l'export
 * Excel (voir {@code staport.rh.paie.export.PaieExportRequestDto}, {@code PaiePerimetreService}).
 * Ignorée en mode {@code SYNTHESE} (rapport agrégé, sans découpage par équipe).
 */
public record PaieReportPdfRequestDto(
        String periode,
        TypeRapport typeRapport,
        FeuillesEquipeMode feuillesEquipeMode,
        Map<String, List<String>> equipesParChantier,
        Map<String, List<String>> equipesExcluesFeuilleChantier
) {

    public enum TypeRapport {
        SYNTHESE,
        DETAILLE
    }
}
