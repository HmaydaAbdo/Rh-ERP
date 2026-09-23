package staport.rh.paie.export;

import staport.rh.paie.reporting.FeuillesEquipeMode;

import java.util.List;
import java.util.Map;

/**
 * Configuration de l'export : période, et pour les feuilles par équipe soit aucune, soit toutes
 * les équipes trouvées pour chaque chantier, soit une sélection explicite par chantier
 * ({@code equipesParChantier}, ignoré hors mode {@code PERSONNALISE}). Indépendamment, pour
 * chaque chantier, les équipes listées dans {@code equipesExcluesFeuilleChantier} n'apparaissent
 * pas sur la feuille globale de CE chantier (la feuille GLB tous chantiers n'est jamais filtrée).
 * Même structure que {@code staport.rh.paie.report.PaieReportPdfRequestDto} (rapport PDF), toutes
 * deux alimentant {@code PaiePerimetreService}.
 */
public record PaieExportRequestDto(
        String periode,
        FeuillesEquipeMode feuillesEquipeMode,
        Map<String, List<String>> equipesParChantier,
        Map<String, List<String>> equipesExcluesFeuilleChantier
) {
}
