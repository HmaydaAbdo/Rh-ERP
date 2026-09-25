package staport.rh.paie.report;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/** Formatage des nombres du rapport PDF — même précision que l'export Excel (2 décimales,
 * séparateur de milliers), en locale française. Aucun symbole de devise. */
final class PaieReportNumberFormat {

    private static final DecimalFormat MONTANT;
    private static final DecimalFormat ENTIER;

    static {
        DecimalFormatSymbols symboles = DecimalFormatSymbols.getInstance(Locale.FRANCE);
        symboles.setGroupingSeparator('\u00A0');
        MONTANT = new DecimalFormat("#,##0.00", symboles);
        ENTIER = new DecimalFormat("#,##0", symboles);
    }

    private PaieReportNumberFormat() {
    }

    static String montant(BigDecimal valeur) {
        return valeur == null ? "—" : MONTANT.format(valeur);
    }

    static String entier(int valeur) {
        return ENTIER.format(valeur);
    }
}