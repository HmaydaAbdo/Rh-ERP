package staport.rh.paie.report;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/**
 * Formatage des nombres du rapport PDF — même précision que l'export Excel (2 décimales, séparateur
 * de milliers, voir {@code PaieExcelStyles.FORMAT_MONETAIRE}), en locale française. Aucun symbole de
 * devise : ni l'Excel existant ni le domaine Paie ne portent de devise explicite (voir
 * docs/paie/README.md), donc le rapport PDF n'en invente pas non plus.
 */
final class PaieReportNumberFormat {

    private static final DecimalFormat MONTANT;
    private static final DecimalFormat POURCENTAGE;

    static {
        DecimalFormatSymbols symboles = DecimalFormatSymbols.getInstance(Locale.FRANCE);
        symboles.setGroupingSeparator('\u00A0');
        MONTANT = new DecimalFormat("#,##0.00", symboles);
        POURCENTAGE = new DecimalFormat("0.0", symboles);
    }

    private PaieReportNumberFormat() {
    }

    static String montant(BigDecimal valeur) {
        return valeur == null ? "—" : MONTANT.format(valeur);
    }

    /** {@code null} si le mois précédent est réellement introuvable (aucune paie sur ce périmètre). */
    static String montantOuIntrouvable(BigDecimal valeur) {
        return valeur == null ? "INTROUVABLE" : MONTANT.format(valeur);
    }

    /** Part de {@code partie} dans {@code total}, en pourcentage — "—" si {@code total} est nul. */
    static String pourcentageDe(BigDecimal partie, BigDecimal total) {
        if (total == null || total.compareTo(BigDecimal.ZERO) == 0) {
            return "—";
        }
        BigDecimal pourcentage = partie.divide(total, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
        return POURCENTAGE.format(pourcentage) + " %";
    }

    /** {@code null} si le calcul n'a pas de sens (pas de mois précédent, ou total précédent nul). */
    static String variationPourcent(BigDecimal actuel, BigDecimal precedent) {
        if (actuel == null || precedent == null || precedent.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        BigDecimal variation = actuel.subtract(precedent)
                .divide(precedent, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
        String signe = variation.signum() > 0 ? "+" : "";
        return signe + POURCENTAGE.format(variation) + " %";
    }
}
