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

    /** {@code null} si aucune paie n'existe sur ce périmètre le mois précédent (le rapport affiche alors
     * le libellé sans valeur). */
    static String montantOuNull(BigDecimal valeur) {
        return valeur == null ? null : MONTANT.format(valeur);
    }

    private static final int[] VALEURS_ROMAINES = {1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};
    private static final String[] SYMBOLES_ROMAINS = {"M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"};

    /** Numérotation des chapitres du rapport (I — Synthèse globale, II — Répartition par chantier,
     * puis un chiffre romain par chantier) — jamais au-delà d'une trentaine de chapitres en pratique,
     * la table classique (M/D/C/L/X/V/I) suffit largement. */
    static String romain(int valeur) {
        StringBuilder resultat = new StringBuilder();
        int reste = valeur;
        for (int i = 0; i < VALEURS_ROMAINES.length; i++) {
            while (reste >= VALEURS_ROMAINES[i]) {
                reste -= VALEURS_ROMAINES[i];
                resultat.append(SYMBOLES_ROMAINS[i]);
            }
        }
        return resultat.toString();
    }
}
