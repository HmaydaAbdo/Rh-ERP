package staport.rh.paie.report;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/** Formatage des nombres du rapport PDF — même précision que l'export Excel, locale française.
 * Les valeurs absentes sont affichées "-", comme dans l'export Excel / l'UI. */
final class PaieReportNumberFormat {

    private static final DecimalFormat MONTANT;
    private static final DecimalFormat ENTIER;
    private static final DecimalFormat QUANTITE;

    static {
        DecimalFormatSymbols symboles = DecimalFormatSymbols.getInstance(Locale.FRANCE);
        symboles.setGroupingSeparator('\u00A0');
        MONTANT = new DecimalFormat("#,##0.00", symboles);
        ENTIER = new DecimalFormat("#,##0", symboles);
        QUANTITE = new DecimalFormat("#,##0.##", symboles);
    }

    private PaieReportNumberFormat() {
    }

    /** Montants (salaire, primes, total) : toujours 2 décimales, "-" si absent. */
    static String montant(BigDecimal valeur) {
        return valeur == null ? "-" : MONTANT.format(valeur);
    }

    /** Jours de récupération (J.R.O, J.R.D) : entier si valeur ronde, sinon décimales utiles ; "-" si absent. */
    static String quantite(BigDecimal valeur) {
        return valeur == null ? "-" : QUANTITE.format(valeur);
    }

    static String entier(int valeur) {
        return ENTIER.format(valeur);
    }
}