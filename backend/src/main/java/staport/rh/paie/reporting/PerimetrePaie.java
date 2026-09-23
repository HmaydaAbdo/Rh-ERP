package staport.rh.paie.reporting;

import staport.rh.paie.entities.Paie;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

/**
 * Périmètre complet d'une période, calculé une seule fois par {@link PaiePerimetreService} et
 * consommé aussi bien par l'export Excel ({@code staport.rh.paie.export}) que par le rapport PDF
 * ({@code staport.rh.paie.report}) — évite de dupliquer la logique de sélection/exclusion équipe.
 * {@code lignesGlobales} et {@code totalMoisPrecedentGlobal} ne sont jamais filtrés par
 * {@code equipesExcluesFeuilleChantier} (l'exclusion ne s'applique qu'à la feuille du chantier
 * concerné, jamais à la vue globale — décision HMAYDA, 2026-09-23).
 */
public record PerimetrePaie(
        YearMonth periode,
        List<Paie> lignesGlobales,
        BigDecimal totalMoisPrecedentGlobal,
        Map<String, PerimetreChantier> parChantier
) {
}
