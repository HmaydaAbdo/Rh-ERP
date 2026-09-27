package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.axis.NumberAxis;
import org.jfree.chart.labels.ItemLabelAnchor;
import org.jfree.chart.labels.ItemLabelPosition;
import org.jfree.chart.labels.StandardCategoryItemLabelGenerator;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.renderer.category.LineAndShapeRenderer;
import org.jfree.data.category.CategoryDataset;
import org.jfree.data.category.DefaultCategoryDataset;
import org.jfree.ui.RectangleInsets;
import org.jfree.ui.TextAnchor;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Shape;
import java.awt.geom.Ellipse2D;
import java.math.BigDecimal;
import java.text.DecimalFormat;

/**
 * Personnalise le {@code <lineChart>} JRXML d'évolution mensuelle (masse, effectif, STC) — un seul
 * graphique par niveau (Global, Chantier, Équipe) au lieu de 2 graphiques séparés, demande explicite
 * de direction. **Double axe Y** : la masse (DH) et les 2 séries de personnes (Effectif, STC)
 * n'ayant pas le même ordre de grandeur, elles ne partagent jamais la même échelle — Masse sur l'axe
 * gauche (son propre {@code CategoryDataset}), Effectif + STC sur l'axe droit (un second
 * {@code CategoryDataset}), tous deux visibles (contrairement aux {@code <barChart>}, dont
 * l'étiquette dans la barre rend l'axe redondant — ici l'ordre de grandeur de la tendance importe
 * autant que les valeurs de chaque point). Le gabarit JRXML ne fournit qu'UN SEUL
 * {@code <categoryDataset>} à 3 séries (Masse (DH) / Effectif / STC, mêmes catégories/mois pour les
 * 3) : ce customizer le scinde en 2 datasets/axes/renderers après coup, JRXML ne sachant pas
 * déclarer un second axe nativement.
 */
public final class PaieReportEvolutionChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_MASSE = new Color(0x25, 0x63, 0xEB);
    private static final Color COULEUR_EFFECTIF = new Color(0xF5, 0x9E, 0x0B);
    private static final Color COULEUR_STC = new Color(0xB9, 0x1C, 0x1C);
    private static final Color COULEUR_GRILLE = new Color(0xDD, 0xDD, 0xDD);
    private static final String SERIE_MASSE = "Masse (DH)";
    private static final String SERIE_STC = "STC";

    @Override
    public void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);
        if (chart.getLegend() != null) {
            chart.getLegend().setItemFont(new Font("Liberation Serif", Font.PLAIN, 9));
        }

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(COULEUR_GRILLE);
        // Marge du haut généreuse : l'étiquette du dernier point (le seul affiché par série, voir plus
        // bas) est positionnée au-dessus/à côté du point — sans cette marge, un point proche du maximum
        // de son axe se retrouve tronqué en haut du graphique (constaté en production).
        plot.setInsets(new RectangleInsets(16, 4, 2, 44));

        CategoryAxis categoryAxis = plot.getDomainAxis();
        categoryAxis.setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        categoryAxis.setCategoryLabelPositions(CategoryLabelPositions.UP_45);

        CategoryDataset datasetOriginal = plot.getDataset();
        if (datasetOriginal == null) {
            return;
        }

        // Scinde le dataset unique (3 séries) en 2 : masse seule (axe gauche), effectif + STC (axe
        // droit, même unité "personnes") — JFreeChart mappe un axe par DATASET, jamais par ligne d'un
        // même dataset.
        DefaultCategoryDataset dsMasse = new DefaultCategoryDataset();
        DefaultCategoryDataset dsPersonnes = new DefaultCategoryDataset();
        for (int row = 0; row < datasetOriginal.getRowCount(); row++) {
            Comparable<?> serie = datasetOriginal.getRowKey(row);
            DefaultCategoryDataset cible = SERIE_MASSE.equals(serie) ? dsMasse : dsPersonnes;
            for (int col = 0; col < datasetOriginal.getColumnCount(); col++) {
                cible.addValue(datasetOriginal.getValue(row, col), serie, datasetOriginal.getColumnKey(col));
            }
        }

        NumberAxis axeMasse = (NumberAxis) plot.getRangeAxis();
        axeMasse.setLabel("Masse (DH)");
        axeMasse.setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        axeMasse.setLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        axeMasse.setVisible(true);
        plot.setDataset(0, dsMasse);

        NumberAxis axePersonnes = new NumberAxis("Effectif / STC");
        axePersonnes.setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        axePersonnes.setLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        plot.setRangeAxis(1, axePersonnes);
        plot.setDataset(1, dsPersonnes);
        plot.mapDatasetToRangeAxis(1, 1);

        LineAndShapeRenderer rendererMasse = (LineAndShapeRenderer) plot.getRenderer(0);
        styliser(rendererMasse, 0, COULEUR_MASSE, true);

        LineAndShapeRenderer rendererPersonnes = new LineAndShapeRenderer();
        plot.setRenderer(1, rendererPersonnes);
        for (int row = 0; row < dsPersonnes.getRowCount(); row++) {
            boolean stc = SERIE_STC.equals(dsPersonnes.getRowKey(row));
            styliser(rendererPersonnes, row, stc ? COULEUR_STC : COULEUR_EFFECTIF, false);
        }
    }

    /** Style commun à une série (couleur, marqueur, étiquette visible uniquement sur le dernier point
     * — voir la justification dans la Javadoc de classe et l'historique Git : centrer l'étiquette sur
     * ce point, le plus à droite du graphique, la ferait déborder pour moitié hors du graphique). */
    private void styliser(LineAndShapeRenderer renderer, int serie, Color couleur, boolean masse) {
        renderer.setSeriesPaint(serie, couleur);
        renderer.setSeriesStroke(serie, new BasicStroke(2f));
        renderer.setSeriesShapesVisible(serie, true);
        Shape marqueur = new Ellipse2D.Double(-2.5, -2.5, 5, 5);
        renderer.setSeriesShape(serie, marqueur);
        renderer.setSeriesOutlinePaint(serie, couleur);
        renderer.setUseFillPaint(true);
        renderer.setSeriesFillPaint(serie, Color.WHITE);

        renderer.setSeriesItemLabelsVisible(serie, Boolean.TRUE);
        renderer.setSeriesItemLabelFont(serie, new Font("Liberation Serif", Font.BOLD, 8));
        renderer.setSeriesItemLabelPaint(serie, couleur.darker());
        renderer.setSeriesItemLabelGenerator(serie, new StandardCategoryItemLabelGenerator(
                "{2}", new DecimalFormat("#,##0")) {
            @Override
            public String generateLabel(CategoryDataset dataset, int row, int column) {
                if (column != dataset.getColumnCount() - 1) {
                    return null;
                }
                Number valeur = dataset.getValue(row, column);
                return masse
                        ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue())) + " DH"
                        : PaieReportNumberFormat.entier(valeur.intValue());
            }
        });
        // Masse (axe gauche) au-dessus de son point, effectif/STC (axe droit) EN DESSOUS du leur :
        // les 2 axes ont des échelles indépendantes, rien ne garantit que leurs derniers points
        // respectifs ne se retrouvent pas à la même hauteur écran (constaté en production, "8" de
        // l'effectif chevauchant "12 670,00 DH" de la masse) — les séparer verticalement (au-dessus /
        // en dessous du point) élimine ce chevauchement dans l'immense majorité des cas, contrairement
        // à un même ancrage pour les 2 séries.
        renderer.setSeriesPositiveItemLabelPosition(serie, masse
                ? new ItemLabelPosition(ItemLabelAnchor.OUTSIDE12, TextAnchor.BOTTOM_RIGHT)
                : new ItemLabelPosition(ItemLabelAnchor.OUTSIDE6, TextAnchor.TOP_RIGHT));
    }
}
