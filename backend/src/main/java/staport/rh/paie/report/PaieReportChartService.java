package staport.rh.paie.report;

import org.jfree.chart.ChartFactory;
import org.jfree.chart.ChartUtils;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.plot.CategoryPlot;
import org.jfree.chart.plot.PlotOrientation;
import org.jfree.chart.renderer.category.BarRenderer;
import org.jfree.chart.ui.RectangleInsets;
import org.jfree.data.category.DefaultCategoryDataset;
import org.springframework.stereotype.Component;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * Génère les graphiques du rapport PDF en PNG embarqué (base64) — le rendu PDF (openhtmltopdf)
 * n'a pas d'URI de base pour référencer un fichier image, voir {@code PaieReportPdfService}.
 * Barres horizontales uniquement : c'est la lecture la plus directe d'un classement de montants
 * pour une direction (voir {@code docs/report/README.md}, section visualisations) — jamais de
 * camembert/donut, qui compare mal plus de 3-4 valeurs.
 */
@Component
class PaieReportChartService {

    private static final String SERIE_MASSE = "Masse de paie (DH)";
    private static final Color COULEUR_BARRE = new Color(0x25, 0x63, 0xEB);
    private static final int LARGEUR_PX = 900;
    // Assez de hauteur par barre pour que l'étiquette de catégorie et l'étiquette de valeur
    // (polices réduites ci-dessous) ne se chevauchent jamais avec la ligne voisine, même avec
    // le nombre de catégories réel observé en production (25 chantiers, ~19 équipes).
    private static final int HAUTEUR_PAR_BARRE_PX = 20;
    private static final int HAUTEUR_MIN_PX = 100;

    /**
     * @param valeurs montant par libellé, déjà classé dans l'ordre d'affichage voulu (le graphique
     *                ne re-trie pas) — voir {@code PaieBiReportBuilder} pour le classement et le
     *                plafonnement du nombre de barres.
     */
    String genererBarresHorizontales(List<Map.Entry<String, BigDecimal>> valeurs) {
        DefaultCategoryDataset dataset = new DefaultCategoryDataset();
        // Ordre d'insertion inversé : JFreeChart dessine la première catégorie insérée en bas,
        // donc la valeur la plus importante (première de la liste) doit être insérée en dernier
        // pour apparaître en haut du graphique.
        for (int i = valeurs.size() - 1; i >= 0; i--) {
            Map.Entry<String, BigDecimal> entree = valeurs.get(i);
            dataset.addValue(entree.getValue(), SERIE_MASSE, entree.getKey());
        }

        JFreeChart chart = ChartFactory.createBarChart(
                null, null, null, dataset, PlotOrientation.HORIZONTAL, false, false, false);
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2, 0xE8, 0xF0));
        plot.setInsets(new RectangleInsets(4, 4, 4, 12));
        plot.getDomainAxis().setTickLabelFont(new Font("SansSerif", Font.PLAIN, 9));
        plot.getDomainAxis().setCategoryLabelPositions(CategoryLabelPositions.STANDARD);
        // Marge entre catégories agrandie : à hauteur de ligne réduite, elle sépare visuellement
        // chaque barre de sa voisine et évite toute impression de chevauchement.
        ((org.jfree.chart.axis.CategoryAxis) plot.getDomainAxis()).setCategoryMargin(0.35);
        plot.getRangeAxis().setTickLabelFont(new Font("SansSerif", Font.PLAIN, 9));
        plot.getRangeAxis().setVisible(false);

        BarRenderer renderer = (BarRenderer) plot.getRenderer();
        renderer.setSeriesPaint(0, COULEUR_BARRE);
        renderer.setShadowVisible(false);
        renderer.setDrawBarOutline(true);
        renderer.setSeriesOutlinePaint(0, COULEUR_BARRE.darker());
        renderer.setSeriesOutlineStroke(0, new BasicStroke(1f));
        renderer.setMaximumBarWidth(0.55);
        renderer.setDefaultItemLabelsVisible(true);
        renderer.setDefaultItemLabelFont(new Font("SansSerif", Font.PLAIN, 9));
        renderer.setDefaultPositiveItemLabelPosition(new org.jfree.chart.labels.ItemLabelPosition(
                org.jfree.chart.labels.ItemLabelAnchor.OUTSIDE12, org.jfree.chart.ui.TextAnchor.CENTER_LEFT));
        renderer.setDefaultItemLabelGenerator(new org.jfree.chart.labels.StandardCategoryItemLabelGenerator(
                "{2}", new java.text.DecimalFormat("#,##0")) {
            @Override
            public String generateLabel(org.jfree.data.category.CategoryDataset categoryDataset, int row, int column) {
                return PaieReportNumberFormat.montant((BigDecimal) categoryDataset.getValue(row, column)) + " DH";
            }
        });

        int hauteur = Math.max(HAUTEUR_MIN_PX, valeurs.size() * HAUTEUR_PAR_BARRE_PX);
        return versBase64Png(chart, LARGEUR_PX, hauteur);
    }

    private String versBase64Png(JFreeChart chart, int largeur, int hauteur) {
        try (ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            ChartUtils.writeChartAsPNG(sortie, chart, largeur, hauteur);
            return Base64.getEncoder().encodeToString(sortie.toByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération d'un graphique du rapport PDF : " + e.getMessage(), e);
        }
    }
}
