package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.renderer.category.LineAndShapeRenderer;
import org.jfree.data.category.CategoryDataset;
import org.jfree.ui.RectangleInsets;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Shape;
import java.awt.geom.Ellipse2D;
import java.math.BigDecimal;
import java.text.DecimalFormat;

/**
 * Personnalise les 2 {@code <lineChart>} JRXML d'évolution mensuelle (masse et effectif) de la
 * synthèse globale — même esprit que {@link PaieReportChartCustomizer} (seule couleur du document,
 * le bleu du logo), mais une courbe se lit avec un axe de valeurs visible (contrairement aux
 * {@code <barChart>}, dont l'étiquette dans la barre rend l'axe redondant) : ici l'ordre de grandeur
 * de la tendance importe autant que les valeurs de chaque point.
 */
public final class PaieReportEvolutionChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_LIGNE = new Color(0x25, 0x63, 0xEB);
    private static final Color COULEUR_GRILLE = new Color(0xDD, 0xDD, 0xDD);

    @Override
    public void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(COULEUR_GRILLE);
        plot.setInsets(new RectangleInsets(4, 4, 2, 10));

        CategoryAxis categoryAxis = plot.getDomainAxis();
        categoryAxis.setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        categoryAxis.setCategoryLabelPositions(CategoryLabelPositions.UP_45);

        plot.getRangeAxis().setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        plot.getRangeAxis().setVisible(true);

        boolean masse = estSerieMasse(plot.getDataset());

        LineAndShapeRenderer renderer = (LineAndShapeRenderer) plot.getRenderer();
        renderer.setSeriesPaint(0, COULEUR_LIGNE);
        renderer.setSeriesStroke(0, new BasicStroke(2f));
        renderer.setSeriesShapesVisible(0, true);
        Shape marqueur = new Ellipse2D.Double(-2.5, -2.5, 5, 5);
        renderer.setSeriesShape(0, marqueur);
        renderer.setSeriesOutlinePaint(0, COULEUR_LIGNE);
        renderer.setUseFillPaint(true);
        renderer.setSeriesFillPaint(0, Color.WHITE);

        renderer.setSeriesItemLabelsVisible(0, Boolean.TRUE);
        renderer.setSeriesItemLabelFont(0, new Font("Liberation Serif", Font.PLAIN, 8));
        renderer.setSeriesItemLabelPaint(0, new Color(0x33, 0x33, 0x33));
        renderer.setSeriesItemLabelGenerator(0, new org.jfree.chart.labels.StandardCategoryItemLabelGenerator(
                "{2}", new DecimalFormat("#,##0")) {
            @Override
            public String generateLabel(CategoryDataset dataset, int row, int column) {
                Number valeur = dataset.getValue(row, column);
                return masse
                        ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue())) + " DH"
                        : PaieReportNumberFormat.entier(valeur.intValue());
            }
        });
        renderer.setSeriesPositiveItemLabelPosition(0, new org.jfree.chart.labels.ItemLabelPosition(
                org.jfree.chart.labels.ItemLabelAnchor.OUTSIDE12, org.jfree.ui.TextAnchor.BOTTOM_CENTER));
    }

    private boolean estSerieMasse(CategoryDataset dataset) {
        return dataset.getRowCount() > 0 && "Masse (DH)".equals(String.valueOf(dataset.getRowKey(0)));
    }
}
