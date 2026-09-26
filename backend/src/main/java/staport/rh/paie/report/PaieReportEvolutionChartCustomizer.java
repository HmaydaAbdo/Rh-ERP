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
        // Marge du haut généreuse : l'étiquette du dernier point (le seul affiché, voir plus bas)
        // est positionnée au-dessus du point — sans cette marge, un point proche du maximum de l'axe
        // se retrouve tronqué en haut du graphique. Marge de droite pour la même raison côté largeur.
        plot.setInsets(new RectangleInsets(16, 4, 2, 40));

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

        // Étiquette de valeur affichée UNIQUEMENT sur le dernier point (mois courant) — avec jusqu'à
        // 12 points dont plusieurs mois à 0 (aucun historique encore disponible, voir
        // PaieBiReportBuilder.evolutionMensuelle), étiqueter chaque point les fait toutes s'empiler
        // sur la même ligne de base et devenir illisibles. Le point le plus récent est la seule valeur
        // qu'un lecteur cherche vraiment sur ce type de courbe ; les autres se lisent sur l'axe.
        renderer.setSeriesItemLabelsVisible(0, Boolean.TRUE);
        renderer.setSeriesItemLabelFont(0, new Font("Liberation Serif", Font.BOLD, 9));
        renderer.setSeriesItemLabelPaint(0, new Color(0x14, 0x33, 0x5C));
        renderer.setSeriesItemLabelGenerator(0, new org.jfree.chart.labels.StandardCategoryItemLabelGenerator(
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
        // TextAnchor.BOTTOM_RIGHT (pas BOTTOM_CENTER) : le seul point étiqueté est le dernier, donc
        // le plus à droite du graphique — un texte centré sur ce point déborde pour moitié hors du
        // graphique (constaté en production, "3 377 370,00 DH" tronqué). BOTTOM_RIGHT fait grandir le
        // texte vers la gauche depuis le point, jamais au-delà du bord droit quel que soit le libellé.
        renderer.setSeriesPositiveItemLabelPosition(0, new org.jfree.chart.labels.ItemLabelPosition(
                org.jfree.chart.labels.ItemLabelAnchor.OUTSIDE12, org.jfree.ui.TextAnchor.BOTTOM_RIGHT));
    }

    private boolean estSerieMasse(CategoryDataset dataset) {
        return dataset.getRowCount() > 0 && "Masse (DH)".equals(String.valueOf(dataset.getRowKey(0)));
    }
}
