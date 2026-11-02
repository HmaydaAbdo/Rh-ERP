package staport.rh.heuresupp.services;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Règle métier : un employé dont le bulletin du mois de la ligne est marqué STC ou sortie (indicateur issu de
 * {@code ObservationStc.estStcOuSortie}) ne peut pas avoir d'heures supplémentaires ce mois-là. Une ligne à zéro
 * heure reste acceptée ; le forfait seul reste refusé par sa propre règle.
 */
public final class RegleStcHeuresSupp {

    private static final DateTimeFormatter MOIS = DateTimeFormatter.ofPattern("LLLL yyyy", Locale.FRENCH);

    private RegleStcHeuresSupp() {
    }

    /** Vrai si des heures strictement positives sont demandées pour un bulletin STC/sortie. */
    public static boolean heuresInterdites(boolean stcOuSortie, BigDecimal heures) {
        return stcOuSortie && heures != null && heures.signum() > 0;
    }

    /** Message de refus sans identité (l'appelant ajoute déjà le CIN, comme l'analyse d'import). */
    public static String messageHeuresRefusees(YearMonth periode) {
        String mois = MOIS.format(periode);
        boolean voyelle = "aeiouéèêh".indexOf(mois.charAt(0)) >= 0;
        return "employé STC/sorti sur la paie " + (voyelle ? "d'" : "de ") + mois
                + " : les heures supplémentaires de ce mois sont refusées (0 heure reste accepté).";
    }

    /** Message de refus avec nom et CIN, pour l'ajout et la modification unitaires. */
    public static String messageHeuresRefusees(String nomPrenom, String cin, YearMonth periode) {
        return nomPrenom + " (CIN " + cin + ") : " + messageHeuresRefusees(periode);
    }
}
