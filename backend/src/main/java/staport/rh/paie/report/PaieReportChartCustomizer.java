package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
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
import java.math.BigDecimal;
import java.text.DecimalFormat;

/**
 * Personnalise les 4 {@code <barChart>} JRXML de la synthèse globale — barres horizontales
 * uniquement, jamais de camembert/donut (voir {@code docs/report/README.md}, section
 * « Visualisations » : une barre horizontale compare mieux plus de 3-4 valeurs et affiche le
 * montant directement). L'orientation du plot n'est pas déclarable dans le schéma JRXML
 * (contrairement aux couleurs/légende, portées par le style du {@code <barChart>} lui-même) — seule
 * personnalisation qui nécessite ce customizer Java. Classe publique : instanciée par réflexion par
 * le moteur JasperReports au rendu (voir {@code customizerClass} dans le JRXML).
 */
public final class PaieReportChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_BARRE = new Color(0x25, 0x63, 0xEB);
    private static final String SERIE_MASSE = "Masse (DH)";

    @Override
    public void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setOrientation(PlotOrientation.HORIZONTAL);
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2, 0xE8, 0xF0));
        plot.setInsets(new RectangleInsets(2, 2, 2, 16));
        plot.getDomainAxis().setTickLabelFont(new Font("DejaVu Sans", Font.PLAIN, 8));
        plot.getDomainAxis().setCategoryLabelPositions(CategoryLabelPositions.STANDARD);
        plot.getRangeAxis().setVisible(false);

        boolean masse = estSerieMasse(plot.getDataset());

        BarRenderer renderer = (BarRenderer) plot.getRenderer();
        renderer.setSeriesPaint(0, COULEUR_BARRE);
        renderer.setShadowVisible(false);
        renderer.setDrawBarOutline(true);
        renderer.setSeriesOutlinePaint(0, COULEUR_BARRE.darker());
        renderer.setSeriesOutlineStroke(0, new BasicStroke(1f));
        renderer.setMaximumBarWidth(0.6);
        renderer.setItemLabelsVisible(true);
        renderer.setItemLabelFont(new Font("DejaVu Sans", Font.PLAIN, 8));
        renderer.setPositiveItemLabelPosition(new ItemLabelPosition(ItemLabelAnchor.OUTSIDE12, TextAnchor.CENTER_LEFT));
        renderer.setItemLabelGenerator(new StandardCategoryItemLabelGenerator("{2}", new DecimalFormat("#,##0")) {
            @Override
            public String generateLabel(CategoryDataset dataset, int row, int column) {
                Number valeur = dataset.getValue(row, column);
                return masse
                        ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue())) + " DH"
                        : PaieReportNumberFormat.entier(valeur.intValue());
            }
        });
    }

    private boolean estSerieMasse(CategoryDataset dataset) {
        return dataset.getRowCount() > 0 && SERIE_MASSE.equals(String.valueOf(dataset.getRowKey(0)));
    }
}
