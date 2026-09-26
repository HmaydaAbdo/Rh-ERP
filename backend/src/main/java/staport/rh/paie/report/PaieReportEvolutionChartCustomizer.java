package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.renderer.category.LineAndShapeRenderer;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.geom.Ellipse2D;

/**
 * Personnalise le {@code <lineChart>} JRXML « Évolution de la masse salariale » — une courbe simple
 * avec des marqueurs par période, jamais de barres (cette vue répond à une question différente des 4
 * {@code <barChart>} de {@link PaieReportChartCustomizer} : une tendance dans le temps, pas une
 * comparaison de catégories, voir {@code docs/report/README.md}). Classe publique : instanciée par
 * réflexion par le moteur JasperReports au rendu (voir {@code customizerClass} dans le JRXML).
 */
public final class PaieReportEvolutionChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_LIGNE = new Color(0x25, 0x63, 0xEB);

    @Override
    public void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2, 0xE8, 0xF0));
        plot.getDomainAxis().setTickLabelFont(new Font("DejaVu Sans", Font.PLAIN, 7));
        plot.getDomainAxis().setCategoryLabelPositions(CategoryLabelPositions.UP_45);
        plot.getRangeAxis().setTickLabelFont(new Font("DejaVu Sans", Font.PLAIN, 7));

        LineAndShapeRenderer renderer = (LineAndShapeRenderer) plot.getRenderer();
        renderer.setSeriesPaint(0, COULEUR_LIGNE);
        renderer.setSeriesStroke(0, new BasicStroke(2.2f));
        renderer.setSeriesShapesVisible(0, true);
        renderer.setSeriesShape(0, new Ellipse2D.Double(-3, -3, 6, 6));
        renderer.setSeriesFillPaint(0, Color.WHITE);
        renderer.setUseFillPaint(true);
        renderer.setSeriesOutlineStroke(0, new BasicStroke(1.5f));
    }
}
