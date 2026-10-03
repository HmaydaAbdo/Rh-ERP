package staport.rh.paie.export;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import staport.rh.paie.reporting.FeuillesEquipeMode;

import java.util.List;
import java.util.Map;

/**
 * Configuration de l'export : période, et pour les feuilles par équipe soit aucune, soit toutes
 * les équipes trouvées pour chaque chantier, soit une sélection explicite par chantier
 * ({@code equipesParChantier}, ignoré hors mode {@code PERSONNALISE}). Indépendamment, pour
 * chaque chantier, les équipes listées dans {@code equipesExcluesFeuilleChantier} n'apparaissent
 * pas sur la feuille globale de CE chantier (la feuille GLB tous chantiers n'est jamais filtrée par
 * cette exclusion). {@code chantiers}, lui, restreint tout l'export (GLB comprise) à la liste de
 * codes donnée — {@code null} ou vide exporte tous les chantiers de la période.
 * {@code materiel} : nombre de chaque ligne du parc matériel (clé = libellé de la ligne, voir
 * {@code MaterielChantierCatalogue.tableaux()}) écrit dans la colonne « Nbre » ; une ligne absente reste vide.
 * Même structure que {@code staport.rh.paie.report.PaieReportPdfRequestDto} (rapport PDF), toutes
 * deux alimentant {@code PaiePerimetreService}.
 */
public record PaieExportRequestDto(
        String periode,
        FeuillesEquipeMode feuillesEquipeMode,
        Map<String, List<String>> equipesParChantier,
        Map<String, List<String>> equipesExcluesFeuilleChantier,
        List<String> chantiers,
        Map<String, @Min(0) @Max(999) Integer> materiel
) {
}
