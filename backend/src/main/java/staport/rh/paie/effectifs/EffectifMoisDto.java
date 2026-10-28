package staport.rh.paie.effectifs;

import java.time.YearMonth;

/**
 * Indicateurs de mouvements d'un mois de paie dans le périmètre. {@code effectifMoisPrecedent}, {@code variation} et
 * {@code plusPayes} sont {@code null} lorsque le mois calendaire précédent n'a pas de paie dans le périmètre ;
 * {@code plusPayes} compte les employés payés au mois précédent et absents du mois courant.
 */
public record EffectifMoisDto(
        YearMonth periode,
        long effectif,
        Long effectifMoisPrecedent,
        Long variation,
        Long entrees,
        Long plusPayes,
        long sorties,
        Long mutations
) {
}
