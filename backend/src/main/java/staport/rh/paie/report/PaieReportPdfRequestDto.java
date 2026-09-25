package staport.rh.paie.report;

import staport.rh.paie.reporting.FeuillesEquipeMode;

import java.util.List;
import java.util.Map;

/**
 * Configuration du rapport PDF : période et — pour déterminer quelles équipes obtiennent leur
 * propre sous-section — la même configuration que l'export Excel (voir
 * {@code staport.rh.paie.export.PaieExportRequestDto}, {@code PaiePerimetreService}).
 * {@code chantiers} restreint tout le rapport (y compris la section GLB) à la liste de codes
 * donnée — {@code null} ou vide génère le rapport pour tous les chantiers de la période.
 */
public record PaieReportPdfRequestDto(
        String periode,
        FeuillesEquipeMode feuillesEquipeMode,
        Map<String, List<String>> equipesParChantier,
        Map<String, List<String>> equipesExcluesFeuilleChantier,
        List<String> chantiers
) {
}