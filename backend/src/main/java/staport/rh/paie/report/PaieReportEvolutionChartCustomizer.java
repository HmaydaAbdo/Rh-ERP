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
import org.jfree.chart.renderer.category.LineAndShapeRenderer;
import org.jfree.data.category.CategoryDataset;
import org.jfree.data.category.DefaultCategoryDataset;
import org.jfree.ui.RectangleInsets;
import org.jfree.ui.TextAnchor;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.geom.Ellipse2D;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Personnalise le {@code <lineChart>} JRXML d'évolution mensuelle (masse, effectif, STC en personnes
 * ET en montant — 4 séries) — un seul graphique par niveau (Global, Chantier, Équipe), demande
 * explicite de direction.
 *
 * <p><b>Normalisation par série (même technique que {@link PaieReportGroupedChartCustomizer})</b> :
 * un double axe Y (masse à gauche, effectif+STC à droite) avait d'abord été tenté, mais s'est révélé
 * insuffisant sur données réelles — l'effectif (ex. 969 personnes) écrase visuellement le STC en
 * personnes (ex. 37) même partagé sur le même axe droit, sa courbe devenant quasi plate contre l'axe
 * (constaté en production). Avec 4 séries d'ordres de grandeur radicalement différents (masse en
 * millions de DH, STC en DH généralement bien plus petit, effectif et STC en personnes sur des
 * échelles elles-mêmes très différentes l'une de l'autre), aucun regroupement à 2 axes ne suffit à
 * garantir que les 4 restent simultanément lisibles. Ce customizer normalise donc chaque série à sa
 * PROPRE valeur maximale (0 à 1, indépendamment des 3 autres) avant de la tracer : la forme/tendance
 * de chaque courbe reste pleinement lisible quelle que soit son échelle réelle, l'axe des valeurs est
 * masqué (il ne représenterait plus rien de cohérent une fois les 4 échelles mélangées sur un même
 * repère), et la vraie valeur (jamais la valeur normalisée) reste affichée en étiquette sur le
 * dernier point de chaque série, lue dans une table conservée avant normalisation.
 */
public final class PaieReportEvolutionChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_MASSE = new Color(0x25, 0x63, 0xEB);
    private static final Color COULEUR_EFFECTIF = new Color(0xF5, 0x9E, 0x0B);
    private static final Color COULEUR_STC_PERSONNES = new Color(0xEF, 0x44, 0x44);
    private static final Color COULEUR_STC_MONTANT = new Color(0x7F, 0x1D, 0x1D);
    private static final Color COULEUR_GRILLE = new Color(0xDD, 0xDD, 0xDD);
    private static final String SERIE_MASSE = "Masse (DH)";
    private static final String SERIE_STC_MONTANT = "STC (DH)";

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
        // Marge haute ET basse : les étiquettes alternent au-dessus/en dessous du dernier point selon
        // la série (voir plus bas), il leur faut de la place des 2 côtés.
        plot.setInsets(new RectangleInsets(20, 4, 20, 44));
        plot.getRangeAxis().setVisible(false);

        CategoryAxis categoryAxis = plot.getDomainAxis();
        categoryAxis.setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        categoryAxis.setCategoryLabelPositions(CategoryLabelPositions.UP_45);

        CategoryDataset original = plot.getDataset();
        if (original == null) {
            return;
        }

        // Vraies valeurs (avant normalisation), conservées pour l'étiquette — clé (série, catégorie).
        // Le dataset réellement tracé (ci-dessous) ne contient plus que des valeurs 0..1.
        Map<String, Map<String, Number>> vraiesValeurs = new LinkedHashMap<>();
        Map<String, Double> maxParSerie = new LinkedHashMap<>();
        for (int row = 0; row < original.getRowCount(); row++) {
            String serie = String.valueOf(original.getRowKey(row));
            Map<String, Number> parCategorie = new LinkedHashMap<>();
            double max = 0;
            for (int col = 0; col < original.getColumnCount(); col++) {
                Number valeur = original.getValue(row, col);
                parCategorie.put(String.valueOf(original.getColumnKey(col)), valeur);
                if (valeur != null) {
                    max = Math.max(max, valeur.doubleValue());
                }
            }
            vraiesValeurs.put(serie, parCategorie);
            maxParSerie.put(serie, max);
        }

        DefaultCategoryDataset normalise = new DefaultCategoryDataset();
        for (int row = 0; row < original.getRowCount(); row++) {
            String serie = String.valueOf(original.getRowKey(row));
            double max = maxParSerie.getOrDefault(serie, 0.0);
            for (int col = 0; col < original.getColumnCount(); col++) {
                Number valeur = original.getValue(row, col);
                double normalisee = (valeur == null || max <= 0) ? 0 : valeur.doubleValue() / max;
                normalise.addValue(normalisee, serie, original.getColumnKey(col));
            }
        }
        plot.setDataset(normalise);

        LineAndShapeRenderer renderer = (LineAndShapeRenderer) plot.getRenderer();

        int nbSeries = normalise.getRowCount();
        for (int serie = 0; serie < nbSeries; serie++) {
            String cle = String.valueOf(normalise.getRowKey(serie));
            boolean montant = SERIE_MASSE.equals(cle) || SERIE_STC_MONTANT.equals(cle);
            Color couleur = couleurDe(cle);

            renderer.setSeriesPaint(serie, couleur);
            renderer.setSeriesStroke(serie, new BasicStroke(2f));
            renderer.setSeriesShapesVisible(serie, true);
            renderer.setSeriesShape(serie, new Ellipse2D.Double(-2.5, -2.5, 5, 5));
            renderer.setSeriesOutlinePaint(serie, couleur);
            renderer.setUseFillPaint(true);
            renderer.setSeriesFillPaint(serie, Color.WHITE);

            // Étiquette de valeur affichée UNIQUEMENT sur le dernier point (mois courant) de chaque
            // série — avec jusqu'à 12 points dont plusieurs mois à 0 tant que l'historique n'est pas
            // encore constitué, étiqueter chaque point les ferait toutes s'empiler et devenir
            // illisibles. Lit la VRAIE valeur dans la table conservée avant normalisation, jamais la
            // valeur normalisée réellement tracée.
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
                    String serieCourante = String.valueOf(dataset.getRowKey(row));
                    Number valeur = vraiesValeurs.getOrDefault(serieCourante, Map.of())
                            .get(String.valueOf(dataset.getColumnKey(column)));
                    if (valeur == null) {
                        return null;
                    }
                    return montant
                            ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue())) + " DH"
                            : PaieReportNumberFormat.entier(valeur.intValue());
                }
            });
            // Alterne au-dessus / en dessous du point selon la parité de la série : les 4 courbes
            // étant désormais toutes normalisées sur la même échelle 0-1, rien ne garantit que leurs
            // derniers points respectifs ne se retrouvent pas à la même hauteur écran — alterner
            // réduit fortement le risque de chevauchement des étiquettes (constaté en production avec
            // un même ancrage pour toutes les séries).
            renderer.setSeriesPositiveItemLabelPosition(serie, serie % 2 == 0
                    ? new ItemLabelPosition(ItemLabelAnchor.OUTSIDE12, TextAnchor.BOTTOM_RIGHT)
                    : new ItemLabelPosition(ItemLabelAnchor.OUTSIDE6, TextAnchor.TOP_RIGHT));
        }
    }

    private Color couleurDe(String serie) {
        if (SERIE_MASSE.equals(serie)) {
            return COULEUR_MASSE;
        }
        if (SERIE_STC_MONTANT.equals(serie)) {
            return COULEUR_STC_MONTANT;
        }
        return "STC (personnes)".equals(serie) ? COULEUR_STC_PERSONNES : COULEUR_EFFECTIF;
    }
}
