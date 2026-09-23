package staport.rh.paie.report;

import org.jfree.chart.ChartFactory;
import org.jfree.chart.ChartUtils;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.labels.StandardPieSectionLabelGenerator;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.plot.PiePlot;
import org.jfree.chart.title.TextTitle;
import org.jfree.data.category.DefaultCategoryDataset;
import org.jfree.data.general.DefaultPieDataset;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontFormatException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.util.Map;

/**
 * Génère les graphiques du rapport PDF sous forme d'images PNG (JFreeChart ne produit pas de PDF
 * vectoriel directement compatible avec openhtmltopdf — l'image bitmap est intégrée dans le HTML
 * via {@code <img src="data:image/png;base64,...">}, voir {@code PaieReportPdfService}).
 */
@Component
class PaieReportChartGenerator {

    private static final int LARGEUR = 700;
    private static final int HAUTEUR = 380;
    private static final Color COULEUR_PRIMAIRE = new Color(0x2563EB);

    private final Font police;

    PaieReportChartGenerator(PaieReportFontProvider fontProvider) {
        try {
            this.police = Font.createFont(Font.TRUETYPE_FONT, fontProvider.resoudre()).deriveFont(12f);
        } catch (FontFormatException | IOException e) {
            throw new IllegalStateException("Police illisible pour la génération des graphiques du rapport PDF", e);
        }
    }

    byte[] graphiqueMasseSalarialeParChantier(Map<String, BigDecimal> masseParChantier) {
        DefaultCategoryDataset dataset = new DefaultCategoryDataset();
        masseParChantier.forEach((chantier, total) -> dataset.addValue(total, "Masse salariale", chantier));

        JFreeChart chart = ChartFactory.createBarChart(
                null, "Chantier", "Masse salariale", dataset);
        appliquerPolice(chart);
        chart.removeLegend(); // une seule série : la légende n'apporte rien
        CategoryPlot plot = chart.getCategoryPlot();
        plot.getDomainAxis().setCategoryLabelPositions(CategoryLabelPositions.UP_45);
        plot.getRenderer().setSeriesPaint(0, COULEUR_PRIMAIRE);
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2E8F0));

        return versPng(chart);
    }

    byte[] graphiqueEffectifParFonction(Map<String, Long> effectifParFonction) {
        DefaultPieDataset<String> dataset = new DefaultPieDataset<>();
        effectifParFonction.forEach(dataset::setValue);

        JFreeChart chart = ChartFactory.createPieChart(null, dataset);
        appliquerPolice(chart);
        PiePlot<String> plot = (PiePlot<String>) chart.getPlot();
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setLabelFont(police);
        plot.setLabelGenerator(new StandardPieSectionLabelGenerator("{1} ({2})"));

        return versPng(chart);
    }

    private void appliquerPolice(JFreeChart chart) {
        if (chart.getLegend() != null) {
            chart.getLegend().setItemFont(police);
        }
        for (int i = 0; i < chart.getSubtitleCount(); i++) {
            if (chart.getSubtitle(i) instanceof TextTitle titre) {
                titre.setFont(police);
            }
        }
        if (chart.getPlot() instanceof CategoryPlot plot) {
            plot.getDomainAxis().setTickLabelFont(police);
            plot.getDomainAxis().setLabelFont(police);
            plot.getRangeAxis().setTickLabelFont(police);
            plot.getRangeAxis().setLabelFont(police);
        }
    }

    private byte[] versPng(JFreeChart chart) {
        try (ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            ChartUtils.writeChartAsPNG(sortie, chart, LARGEUR, HAUTEUR);
            return sortie.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération d'un graphique du rapport PDF", e);
        }
    }
}