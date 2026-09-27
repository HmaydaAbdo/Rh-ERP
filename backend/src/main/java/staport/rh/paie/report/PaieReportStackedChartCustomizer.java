package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.labels.ItemLabelAnchor;
import org.jfree.chart.labels.ItemLabelPosition;
import org.jfree.chart.labels.StandardCategoryItemLabelGenerator;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.plot.PlotOrientation;
import org.jfree.chart.renderer.category.BarRenderer;
import org.jfree.data.category.CategoryDataset;
import org.jfree.ui.RectangleInsets;
import org.jfree.ui.TextAnchor;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.text.DecimalFormat;

/**
 * Base commune des {@code <stackedBarChart>} JRXML du chapitre II (répartition par chantier,
 * décomposée par équipe) — colonnes VERTICALES empilées, une couleur par équipe, montant affiché à
 * l'intérieur d'un segment uniquement s'il est assez grand pour le contenir (voir
 * {@link #SEUIL_AFFICHAGE_SEGMENT}), légende portée par {@code <chartLegend>} JRXML (voir
 * {@code rapport.jrxml}). Élargissement délibéré de la règle "une seule couleur (bleu) dans tout le
 * document" (voir {@code docs/report/README.md}, section « Style visuel ») : une légende à plusieurs
 * équipes exige plusieurs couleurs distinctes — la palette reste une famille de bleus/marine
 * cohérente avec le reste du document, jamais une palette arc-en-ciel générique. Classe abstraite :
 * seul le formatage du libellé (montant en DH vs effectif entier) diffère entre les 2 usages (masse,
 * effectif), voir {@link PaieReportChantierMasseStackedChartCustomizer} /
 * {@link PaieReportChantierEffectifStackedChartCustomizer} — {@code JRChartCustomizer} est instancié
 * par réflexion avec un constructeur sans argument, jamais paramétrable directement depuis le JRXML.
 */
abstract class PaieReportStackedChartCustomizer implements JRChartCustomizer {

    /** Une équipe dont le segment représente moins de 6% de la masse/effectif total de sa colonne
     * n'affiche pas d'étiquette — le segment est alors trop petit pour contenir le texte sans
     * déborder sur le segment voisin (« afficher les montants à l'intérieur des barres lorsque
     * l'espace le permet », demande explicite). Sa valeur reste lisible dans la légende + en
     * survolant les données du tableau qui suit le graphique. */
    private static final double SEUIL_AFFICHAGE_SEGMENT = 0.06;

    private static final Color[] PALETTE_EQUIPES = {
            new Color(0x01, 0x1F, 0x5B),
            new Color(0x1D, 0x4E, 0xD8),
            new Color(0x25, 0x63, 0xEB),
            new Color(0x0E, 0xA5, 0xE9),
            new Color(0x38, 0xBD, 0xF8),
            new Color(0x0C, 0x4A, 0x6E),
            new Color(0x60, 0xA5, 0xFA),
            new Color(0x1E, 0x3A, 0x8A),
    };
    private static final Color COULEUR_AUTRES_EQUIPES = new Color(0x9C, 0xA3, 0xAF);
    private static final String LIBELLE_AUTRES_EQUIPES = "Autres équipes";

    @Override
    public final void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setOrientation(PlotOrientation.VERTICAL);
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2, 0xE8, 0xF0));
        plot.getRangeAxis().setVisible(false);
        // Marge modeste : plus d'étiquette à l'extérieur au-dessus de la colonne (elles sont
        // désormais à l'intérieur des segments), contrairement aux barCharts à série unique.
        plot.setInsets(new RectangleInsets(8, 4, 4, 4));

        CategoryAxis categoryAxis = plot.getDomainAxis();
        categoryAxis.setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 9));
        // Rotation à 45° : jusqu'à 20 chantiers sur la largeur de page, un libellé horizontal
        // STANDARD se chevaucherait avec ses voisins (même principe que l'axe des mois des
        // graphiques d'évolution, voir PaieReportEvolutionChartCustomizer).
        categoryAxis.setCategoryLabelPositions(CategoryLabelPositions.UP_45);
        // Évite la troncature "..." par défaut de JFreeChart sur un libellé incliné un peu long (voir
        // la même remarque dans PaieReportChartCustomizer).
        categoryAxis.setMaximumCategoryLabelWidthRatio(2.0f);
        categoryAxis.setCategoryMargin(0.08);
        categoryAxis.setLowerMargin(0.01);
        categoryAxis.setUpperMargin(0.01);

        CategoryDataset dataset = plot.getDataset();
        if (dataset == null) {
            return;
        }

        BarRenderer renderer = (BarRenderer) plot.getRenderer();
        renderer.setShadowVisible(false);
        renderer.setDrawBarOutline(false);

        StandardCategoryItemLabelGenerator generateur = new StandardCategoryItemLabelGenerator(
                "{2}", new DecimalFormat("#,##0")) {
            @Override
            public String generateLabel(CategoryDataset dataset, int row, int column) {
                Number valeur = dataset.getValue(row, column);
                if (valeur == null || valeur.doubleValue() <= 0) {
                    return null;
                }
                double total = totalColonne(dataset, column);
                if (total <= 0 || valeur.doubleValue() / total < SEUIL_AFFICHAGE_SEGMENT) {
                    return null;
                }
                return formatValeur(valeur);
            }
        };

        int nbSeries = dataset.getRowCount();
        for (int serie = 0; serie < nbSeries; serie++) {
            boolean estAutres = LIBELLE_AUTRES_EQUIPES.equals(String.valueOf(dataset.getRowKey(serie)));
            Color couleur = estAutres ? COULEUR_AUTRES_EQUIPES : PALETTE_EQUIPES[serie % PALETTE_EQUIPES.length];
            renderer.setSeriesPaint(serie, couleur);
            renderer.setSeriesOutlinePaint(serie, couleur.darker());
            renderer.setSeriesOutlineStroke(serie, new BasicStroke(1f));
            renderer.setSeriesItemLabelsVisible(serie, Boolean.TRUE);
            renderer.setSeriesItemLabelFont(serie, new Font("Liberation Serif", Font.BOLD, 8));
            renderer.setSeriesItemLabelPaint(serie, Color.WHITE);
            renderer.setSeriesPositiveItemLabelPosition(serie,
                    new ItemLabelPosition(ItemLabelAnchor.CENTER, TextAnchor.CENTER));
            renderer.setSeriesItemLabelGenerator(serie, generateur);
        }
    }

    private static double totalColonne(CategoryDataset dataset, int column) {
        double total = 0;
        for (int row = 0; row < dataset.getRowCount(); row++) {
            Number valeur = dataset.getValue(row, column);
            if (valeur != null) {
                total += valeur.doubleValue();
            }
        }
        return total;
    }

    /** Formate la valeur d'un segment pour son étiquette — montant en DH pour le graphique de masse,
     * entier brut pour celui d'effectif (voir les 2 sous-classes concrètes). */
    abstract String formatValeur(Number valeur);
}
