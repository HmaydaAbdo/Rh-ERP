package staport.rh.paie.report;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

final class PaieReportNumberFormat {

    private static final DecimalFormat MONTANT;
    private static final DecimalFormat ENTIER;
    private static final DecimalFormat QUANTITE;
    private static final DecimalFormat POURCENTAGE;

    static {
        DecimalFormatSymbols symboles = DecimalFormatSymbols.getInstance(Locale.FRANCE);
        symboles.setGroupingSeparator('\u00A0');
        MONTANT = new DecimalFormat("#,##0.00", symboles);
        ENTIER = new DecimalFormat("#,##0", symboles);
        QUANTITE = new DecimalFormat("#,##0.##", symboles);
        POURCENTAGE = new DecimalFormat("0.0", symboles);
    }

    private PaieReportNumberFormat() {
    }

    static String montant(BigDecimal valeur) {
        return valeur == null ? "-" : MONTANT.format(valeur);
    }

    static String quantite(BigDecimal valeur) {
        return valeur == null ? "-" : QUANTITE.format(valeur);
    }

    static String entier(int valeur) {
        return ENTIER.format(valeur);
    }

    /** "INTROUVABLE" si aucune paie n'existe sur ce périmètre le mois précédent. */
    static String montantOuIntrouvable(BigDecimal valeur) {
        return valeur == null ? "INTROUVABLE" : MONTANT.format(valeur);
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