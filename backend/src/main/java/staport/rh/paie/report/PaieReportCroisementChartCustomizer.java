package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.plot.PlotOrientation;
import org.jfree.chart.renderer.category.StackedBarRenderer;
import org.jfree.data.category.CategoryDataset;
import org.jfree.ui.RectangleInsets;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;

/**
 * Personnalise le {@code <stackedBarChart>} Équipe × Fonction d'un chantier — une catégorie par
 * équipe, un segment coloré par fonction (voir {@code PaieBiReportBuilder.croisementEquipeFonction}
 * et {@code CroisementBean}). Seul graphique du document à plus d'une couleur : une composition
 * (quelle part de la masse d'une équipe vient de quelle fonction) ne se lit pas avec une seule
 * teinte — la palette reste volontairement une gamme de bleus (jamais arc-en-ciel) pour rester dans
 * l'esprit du document (voir {@code docs/report/README.md}, section « Style visuel »).
 */
public final class PaieReportCroisementChartCustomizer implements JRChartCustomizer {

    private static final Color BLEU_FONCE = new Color(0x14, 0x33, 0x5C);
    private static final Color BLEU_CLAIR = new Color(0xBF, 0xDB, 0xFE);

    @Override
    public void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);
        if (chart.getLegend() != null) {
            chart.getLegend().setItemFont(new Font("Liberation Serif", Font.PLAIN, 8));
        }

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setOrientation(PlotOrientation.VERTICAL);
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2, 0xE8, 0xF0));
        plot.setInsets(new RectangleInsets(4, 4, 4, 4));

        CategoryAxis categoryAxis = plot.getDomainAxis();
        categoryAxis.setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 9));
        categoryAxis.setCategoryLabelPositions(CategoryLabelPositions.STANDARD);
        categoryAxis.setCategoryMargin(0.15);
        plot.getRangeAxis().setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));

        StackedBarRenderer renderer = (StackedBarRenderer) plot.getRenderer();
        renderer.setShadowVisible(false);
        renderer.setDrawBarOutline(true);
        renderer.setMaximumBarWidth(0.45);

        CategoryDataset dataset = plot.getDataset();
        int nombreSeries = dataset.getRowCount();
        for (int serie = 0; serie < nombreSeries; serie++) {
            Color couleur = degradeBleu(serie, nombreSeries);
            renderer.setSeriesPaint(serie, couleur);
            renderer.setSeriesOutlinePaint(serie, couleur.darker());
            renderer.setSeriesOutlineStroke(serie, new BasicStroke(0.75f));
            renderer.setSeriesItemLabelsVisible(serie, Boolean.FALSE);
        }
    }

    /** Une teinte de bleu par série, du plus foncé (première fonction, la plus lourde — voir
     * PaieBiReportBuilder.fonctionsLesPlusLourdes, déjà triée) au plus clair — jamais une palette
     * arc-en-ciel, voir la Javadoc de la classe. */
    private Color degradeBleu(int index, int total) {
        if (total <= 1) {
            return BLEU_FONCE;
        }
        double ratio = (double) index / (total - 1);
        int r = (int) Math.round(BLEU_FONCE.getRed() + ratio * (BLEU_CLAIR.getRed() - BLEU_FONCE.getRed()));
        int g = (int) Math.round(BLEU_FONCE.getGreen() + ratio * (BLEU_CLAIR.getGreen() - BLEU_FONCE.getGreen()));
        int b = (int) Math.round(BLEU_FONCE.getBlue() + ratio * (BLEU_CLAIR.getBlue() - BLEU_FONCE.getBlue()));
        return new Color(r, g, b);
    }
}
