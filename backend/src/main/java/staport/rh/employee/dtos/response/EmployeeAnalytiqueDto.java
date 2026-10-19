package staport.rh.employee.dtos.response;

import java.math.BigDecimal;
import java.util.List;

/**
 * Chiffres clés des employés d'un périmètre (filtres de la barre) : effectif, âge et ancienneté moyens, embauches de
 * l'année écoulée, puis la répartition par tranche d'âge et par tranche d'ancienneté (tranches décidées le 2026-10-19,
 * voir docs/employee/README.md, « Vues Cartes et Analytique »). Âge et ancienneté sont en années, à une décimale.
 */
public record EmployeeAnalytiqueDto(
        long effectif,
        long actifs,
        long inactifs,
        BigDecimal ageMoyen,
        BigDecimal ancienneteMoyenne,
        long embauchesDouzeMois,
        List<TrancheDto> parAge,
        List<TrancheDto> parAnciennete
) {

    /** Une tranche {@code [min, max[} en années ; {@code max} vaut {@code null} pour la dernière (« et plus »). */
    public record TrancheDto(int min, Integer max, long effectif) {
    }
}
