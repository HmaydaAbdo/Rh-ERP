package staport.rh.paie.exceptions;

import java.time.YearMonth;

/**
 * Levée quand un rapport est demandé pour une période sans aucun bulletin de paie — mieux vaut un
 * message clair qu'un PDF de direction rempli de zéros et de graphiques vides.
 */
public class AucunePaiePeriodeException extends RuntimeException {

    public AucunePaiePeriodeException(YearMonth periode) {
        super("Aucun bulletin de paie pour la période " + periode + " : aucun rapport à générer.");
    }
}