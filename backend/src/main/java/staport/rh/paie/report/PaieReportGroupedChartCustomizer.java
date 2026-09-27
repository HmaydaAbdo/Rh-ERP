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
import org.jfree.chart.plot.PlotOrientation;
import org.jfree.chart.renderer.category.BarRenderer;
import org.jfree.data.category.CategoryDataset;
import org.jfree.data.category.DefaultCategoryDataset;
import org.jfree.ui.RectangleInsets;
import org.jfree.ui.TextAnchor;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Personnalise les {@code <barChart>} JRXML à barres groupées HORIZONTALES (3 séries : Masse (DH),
 * Effectif (personnes), STC (personnes) — chaque série de la légende porte son unité, demande
 * explicite de direction) — chapitre II (répartition par chantier), répartition par équipe au
 * niveau chantier, et répartition par fonction au niveau équipe. Convention
 * retenue après retour direction : un double axe X numérique (DH vs personnes) a été jugé trop risqué
 * à fiabiliser côté JFreeChart pour des barres groupées — l'axe des valeurs reste donc **masqué**,
 * chaque barre affichant directement sa valeur exacte.
 *
 * <p><b>Normalisation par série (pas seulement un axe masqué)</b> : masse (milliers de DH) et
 * effectif/STC (quelques unités de personnes) ont des ordres de grandeur si différents qu'un simple
 * axe masqué ne suffit pas — les 3 séries restent dessinées sur la MÊME échelle linéaire sous-jacente,
 * ce qui rend les barres effectif/STC visuellement nulles à côté de la masse (constaté en production :
 * seules les étiquettes "5"/"1" étaient visibles, la barre elle-même large de quelques pixels contre
 * l'axe). Ce customizer construit donc un dataset de tracé où chaque série est ramenée à sa propre
 * valeur maximale (0 à 1, indépendamment des 2 autres séries) — la longueur d'une barre reste
 * significative pour COMPARER cette série entre catégories (ex. quel chantier a le plus de STC), mais
 * plus jamais pour comparer 2 séries différentes entre elles (ce qui n'aurait de toute façon aucun
 * sens entre DH et personnes). L'étiquette affichée sur chaque barre reste la vraie valeur (jamais la
 * valeur normalisée), lue dans une table à part conservée avant normalisation.
 */
public final class PaieReportGroupedChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_MASSE = new Color(0x25, 0x63, 0xEB);
    private static final Color COULEUR_EFFECTIF = new Color(0xF5, 0x9E, 0x0B);
    private static final Color COULEUR_STC = new Color(0xB9, 0x1C, 0x1C);
    private static final String SERIE_MASSE = "Masse (DH)";
    private static final String SERIE_STC = "STC (personnes)";

    @Override
    public void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setOrientation(PlotOrientation.HORIZONTAL);
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2, 0xE8, 0xF0));
        // Marge de droite généreuse : l'étiquette de valeur est à l'extérieur de chaque barre (voir
        // plus bas), il lui faut de la place même pour le plus gros montant du graphique.
        plot.setInsets(new RectangleInsets(4, 4, 4, 90));
        plot.getDomainAxis().setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 9));
        plot.getDomainAxis().setCategoryLabelPositions(CategoryLabelPositions.STANDARD);
        plot.getRangeAxis().setVisible(false);

        // 3 barres par catégorie (masse/effectif/STC) au lieu d'une seule : marge généreuse entre
        // catégories (chantier/équipe/fonction) ET entre les 3 barres d'un même groupe (voir
        // renderer.setItemMargin ci-dessous) — les valeurs par défaut précédentes (0.18/0.06)
        // laissaient les catégories quasi collées les unes aux autres (constaté en production sur un
        // graphique à 25 chantiers), rendant la lecture visuelle difficile malgré des étiquettes
        // correctes.
        CategoryAxis categoryAxis = (CategoryAxis) plot.getDomainAxis();
        categoryAxis.setCategoryMargin(0.35);
        categoryAxis.setLowerMargin(0.02);
        categoryAxis.setUpperMargin(0.02);

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

        BarRenderer renderer = (BarRenderer) plot.getRenderer();
        renderer.setShadowVisible(false);
        renderer.setDrawBarOutline(true);
        renderer.setItemMargin(0.15);

        // Étiquette de valeur à l'extérieur de chaque barre (jamais à l'intérieur, voir
        // PaieReportEvolutionChartCustomizer pour la même règle) — lit la VRAIE valeur dans la table
        // conservée avant normalisation, jamais la valeur normalisée réellement tracée. Formatage
        // différent selon la série : montant en DH pour la masse, entier brut pour l'effectif et le
        // STC (nombre de personnes, jamais d'unité).
        StandardCategoryItemLabelGenerator generateur = new StandardCategoryItemLabelGenerator(
                "{2}", new DecimalFormat("#,##0")) {
            @Override
            public String generateLabel(CategoryDataset dataset, int row, int column) {
                String serie = String.valueOf(dataset.getRowKey(row));
                String categorie = String.valueOf(dataset.getColumnKey(column));
                Number valeur = vraiesValeurs.getOrDefault(serie, Map.of()).get(categorie);
                if (valeur == null) {
                    return null;
                }
                boolean masse = SERIE_MASSE.equals(serie);
                return masse
                        ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue()))
                        : PaieReportNumberFormat.entier(valeur.intValue());
            }
        };

        int nbSeries = normalise.getRowCount();
        for (int serie = 0; serie < nbSeries; serie++) {
            String cle = String.valueOf(normalise.getRowKey(serie));
            Color couleur = SERIE_MASSE.equals(cle) ? COULEUR_MASSE : SERIE_STC.equals(cle) ? COULEUR_STC : COULEUR_EFFECTIF;
            renderer.setSeriesPaint(serie, couleur);
            renderer.setSeriesOutlinePaint(serie, couleur.darker());
            renderer.setSeriesOutlineStroke(serie, new BasicStroke(1f));
            renderer.setSeriesItemLabelsVisible(serie, Boolean.TRUE);
            renderer.setSeriesItemLabelFont(serie, new Font("Liberation Serif", Font.BOLD, 8));
            renderer.setSeriesItemLabelPaint(serie, Color.BLACK);
            renderer.setSeriesPositiveItemLabelPosition(serie,
                    new ItemLabelPosition(ItemLabelAnchor.OUTSIDE3, TextAnchor.CENTER_LEFT));
            renderer.setSeriesItemLabelGenerator(serie, generateur);
        }
    }
}
