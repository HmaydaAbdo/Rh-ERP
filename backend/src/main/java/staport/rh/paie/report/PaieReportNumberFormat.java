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

    /** {@code null} si le calcul n'a pas de sens (pas de mois précédent, ou total précédent nul —
     * une division par un total précédent nul produirait une variation % trompeuse). */
    static String variationPourcent(BigDecimal actuel, BigDecimal precedent) {
        if (actuel == null || precedent == null || precedent.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        BigDecimal variation = actuel.subtract(precedent)
                .divide(precedent, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
        return avecSigne(POURCENTAGE.format(variation) + " %", variation.signum());
    }

    /** Part d'un montant dans un total, en pourcentage — {@code "-"} si le total est nul ou zéro
     * (une part de zéro n'a pas de sens, distinct d'une part réellement nulle). */
    static String part(BigDecimal montant, BigDecimal total) {
        if (montant == null || total == null || total.compareTo(BigDecimal.ZERO) == 0) {
            return "-";
        }
        BigDecimal pourcentage = montant.divide(total, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
        return POURCENTAGE.format(pourcentage) + " %";
    }

    /** Variation en valeur absolue (montant), signée — {@code null} si pas de mois précédent
     * disponible (distinct d'une variation nulle, réellement calculée à partir de deux montants). */
    static String variationAbsolue(BigDecimal actuel, BigDecimal precedent) {
        if (actuel == null || precedent == null) {
            return null;
        }
        BigDecimal variation = actuel.subtract(precedent);
        return avecSigne(MONTANT.format(variation), variation.signum());
    }

    /** Sens de la variation pour piloter l'icône/couleur du template — jamais déduit d'une chaîne
     * déjà formatée (qui masquerait un signe "+0,00" comme une hausse). */
    static Tendance tendance(BigDecimal actuel, BigDecimal precedent) {
        if (actuel == null || precedent == null) {
            return Tendance.NON_DISPONIBLE;
        }
        int comparaison = actuel.compareTo(precedent);
        if (comparaison > 0) {
            return Tendance.HAUSSE;
        }
        return comparaison < 0 ? Tendance.BAISSE : Tendance.STABLE;
    }

    private static String avecSigne(String valeurFormatee, int signe) {
        return (signe > 0 ? "+" : "") + valeurFormatee;
    }

    enum Tendance {
        HAUSSE, BAISSE, STABLE, NON_DISPONIBLE
    }
}