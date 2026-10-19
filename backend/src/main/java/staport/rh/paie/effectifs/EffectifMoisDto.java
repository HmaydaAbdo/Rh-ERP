package staport.rh.paie.effectifs;

import java.time.YearMonth;

/**
 * Les mouvements d'un mois de paie dans le périmètre : employés payés, entrées (payés ce mois-ci mais pas le mois
 * précédent), sorties (départs enregistrés ce mois-ci), mutations (payés les deux mois, sur un autre chantier). Le premier
 * mois connu n'a rien à quoi se comparer : entrées et mutations y valent {@code null}.
 */
public record EffectifMoisDto(
        YearMonth periode,
        long effectif,
        Long entrees,
        long sorties,
        Long mutations
) {
}
