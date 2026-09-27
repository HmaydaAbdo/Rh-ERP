package staport.rh.paie.report;

import java.math.BigDecimal;

/**
 * Étiquette de segment en montant DH — voir {@link PaieReportStackedChartCustomizer} pour la
 * personnalisation commune (orientation, palette, seuil d'affichage). Classe publique : instanciée
 * par réflexion par le moteur JasperReports au rendu (voir {@code customizerClass} dans
 * {@code rapport.jrxml}).
 */
public final class PaieReportChantierMasseStackedChartCustomizer extends PaieReportStackedChartCustomizer {

    @Override
    String formatValeur(Number valeur) {
        return PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue()));
    }
}
