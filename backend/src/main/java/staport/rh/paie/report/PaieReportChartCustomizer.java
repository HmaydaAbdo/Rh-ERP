package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.labels.ItemLabelAnchor;
import org.jfree.chart.labels.ItemLabelPosition;
import org.jfree.chart.labels.StandardCategoryItemLabelGenerator;
import org.jfree.chart.axis.CategoryAxis;
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
        // Marge de droite généreuse : les étiquettes de valeur sont maintenant à l'extérieur de la
        // barre (voir plus bas), il leur faut de la place même pour le plus gros montant du graphique
        // — jamais un montant tronqué en bord de page.
        plot.setInsets(new RectangleInsets(4, 4, 4, 90));
        plot.getDomainAxis().setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 9));
        plot.getDomainAxis().setCategoryLabelPositions(CategoryLabelPositions.STANDARD);
        plot.getRangeAxis().setVisible(false);

        // Barres épaisses et peu espacées : chaque graphique occupe désormais sa propre page pleine
        // largeur (un seul graphique par page, jamais deux côte à côte), la marge entre catégories
        // peut donc rester très faible sans jamais compresser les barres visuellement.
        CategoryAxis categoryAxis = (CategoryAxis) plot.getDomainAxis();
        categoryAxis.setCategoryMargin(0.08);
        categoryAxis.setLowerMargin(0.01);
        categoryAxis.setUpperMargin(0.01);

        boolean masse = estSerieMasse(plot.getDataset());

        BarRenderer renderer = (BarRenderer) plot.getRenderer();
        renderer.setSeriesPaint(0, COULEUR_BARRE);
        renderer.setShadowVisible(false);
        renderer.setDrawBarOutline(true);
        renderer.setSeriesOutlinePaint(0, COULEUR_BARRE.darker());
        renderer.setSeriesOutlineStroke(0, new BasicStroke(1f));
        renderer.setMaximumBarWidth(1.0);
        // Étiquette de valeur à l'extérieur de la barre (jamais à l'intérieur) — demande explicite :
        // une barre courte (petit chantier) est parfois trop étroite pour contenir son étiquette, qui
        // disparaîtrait silencieusement si elle restait centrée dedans. À l'extérieur, l'étiquette
        // reste toujours entièrement visible quelle que soit la longueur de la barre. Texte noir
        // (plus de contraste blanc-sur-bleu nécessaire, l'étiquette est maintenant sur fond blanc).
        // Réglages au niveau de la série (pas des setters "base" dépréciés) : le thème par défaut
        // de JasperReports positionne déjà une visibilité par série avant l'appel de ce customizer,
        // qui prime sinon silencieusement sur setItemLabelsVisible(true) et empêche tout affichage.
        renderer.setSeriesItemLabelsVisible(0, Boolean.TRUE);
        renderer.setSeriesItemLabelFont(0, new Font("Liberation Serif", Font.BOLD, 9));
        renderer.setSeriesItemLabelPaint(0, Color.BLACK);
        renderer.setSeriesPositiveItemLabelPosition(0, new ItemLabelPosition(ItemLabelAnchor.OUTSIDE12, TextAnchor.CENTER_LEFT));
        renderer.setSeriesItemLabelGenerator(0, new StandardCategoryItemLabelGenerator("{2}", new DecimalFormat("#,##0")) {
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
