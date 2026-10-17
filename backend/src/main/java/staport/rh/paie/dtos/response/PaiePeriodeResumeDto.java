package staport.rh.paie.dtos.response;

import java.math.BigDecimal;

/** Résumé d'un mois qui contient de la paie — alimente le sélecteur de mois de l'assistant d'export (mois
 * disponibles + aperçu immédiat du contenu). {@code periode} au format {@code aaaa-MM}. */
public record PaiePeriodeResumeDto(
        String periode,
        long nombreBulletins,
        long nombreChantiers,
        BigDecimal masse,
        long stc,
        BigDecimal stcMontant
) {
}
