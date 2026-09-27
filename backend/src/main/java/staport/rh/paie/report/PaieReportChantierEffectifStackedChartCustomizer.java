package staport.rh.paie.report;

/**
 * Étiquette de segment en effectif entier — voir {@link PaieReportStackedChartCustomizer} pour la
 * personnalisation commune (orientation, palette, seuil d'affichage). Classe publique : instanciée
 * par réflexion par le moteur JasperReports au rendu (voir {@code customizerClass} dans
 * {@code rapport.jrxml}).
 */
public final class PaieReportChantierEffectifStackedChartCustomizer extends PaieReportStackedChartCustomizer {

    @Override
    String formatValeur(Number valeur) {
        return PaieReportNumberFormat.entier(valeur.intValue());
    }
}
