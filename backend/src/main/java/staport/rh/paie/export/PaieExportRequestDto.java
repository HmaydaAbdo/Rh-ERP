package staport.rh.paie.export;

import java.util.List;
import java.util.Map;

/**
 * Configuration de l'export : période, et pour les feuilles par équipe soit aucune, soit toutes
 * les équipes trouvées pour chaque chantier, soit une sélection explicite par chantier
 * ({@code equipesParChantier}, ignoré hors mode {@code PERSONNALISE}). Indépendamment, pour
 * chaque chantier, les équipes listées dans {@code equipesExcluesFeuilleChantier} n'apparaissent
 * pas sur la feuille globale de CE chantier (la feuille GLB tous chantiers n'est jamais filtrée).
 */
public record PaieExportRequestDto(
        String periode,
        FeuillesEquipeMode feuillesEquipeMode,
        Map<String, List<String>> equipesParChantier,
        Map<String, List<String>> equipesExcluesFeuilleChantier
) {

    public enum FeuillesEquipeMode {
        AUCUNE,
        TOUTES,
        PERSONNALISE
    }
}
