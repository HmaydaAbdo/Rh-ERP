package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.axis.NumberAxis;
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
 * Personnalise le {@code <lineChart>} JRXML d'évolution mensuelle (masse, effectif — 2 séries) — un
 * seul graphique par niveau (Global, Chantier), demande explicite de direction. Le STC (en personnes
 * et en DH) a été retiré de ces graphiques (demande explicite de direction) — il reste visible dans
 * les graphiques à barres (voir {@link PaieReportGroupedChartCustomizer}), simplement plus dans
 * l'historique mensuel.
 *
 * <p><b>2 axes Y visibles comme repères d'unité, PAS comme échelle réelle</b> : demande explicite de
 * direction (« laisser les axes, au moins comme mesure d'unité, un pour personnes et l'autre pour
 * DH »). Axe gauche libellé "DH" (masse), axe droit libellé "Personnes" (effectif) — mais leurs
 * graduations numériques restent masquées ({@code setTickLabelsVisible}/{@code setTickMarksVisible} à
 * {@code false}) : un double axe Y à échelle RÉELLE avait déjà été tenté et écarté (voir historique
 * ci-dessous), les 2 axes ici ne servent qu'à indiquer visuellement quel côté du graphique regrouper
 * mentalement, jamais à lire une valeur dessus.
 *
 * <p><b>Chaque série reste normalisée à sa PROPRE valeur maximale</b> (0 à 1, même technique que
 * {@link PaieReportGroupedChartCustomizer}) : masse (DH) et effectif (personnes) n'ayant jamais le
 * même ordre de grandeur, chacune est ramenée à sa propre échelle avant d'être tracée. La forme/
 * tendance de chaque courbe reste donc pleinement lisible quelle que soit son échelle réelle, et la
 * vraie valeur (jamais la valeur normalisée) reste affichée en étiquette sur CHAQUE point (pas
 * seulement le dernier — demande explicite de direction : un rapport imprimé n'a pas de survol souris
 * pour révéler une valeur, contrairement à un graphique web), lue dans une table conservée avant
 * normalisation. Un point à exactement 0 n'affiche pas d'étiquette (même convention que
 * {@link PaieReportGroupedChartCustomizer}) : avec la fenêtre glissante, un 0 signifie une absence
 * réelle de donnée ce mois-là (ex. un chantier pas encore démarré), pas une valeur à mettre en avant.
 *
 * <p><b>Étiquette de masse orientée vers la gauche (son axe), étiquette d'effectif vers la droite</b> —
 * demande explicite de direction, pour ne jamais faire cohabiter au même endroit une étiquette en DH
 * et une en personnes.
 *
 * <p><b>Historique</b> : une 1ʳᵉ version à double axe Y RÉEL (masse à gauche, effectif + STC en
 * personnes à droite, partageant la même échelle) fonctionnait sur données synthétiques modestes mais
 * s'est révélée insuffisante sur données réelles — un effectif à ~969 personnes écrasait
 * visuellement un STC à ~37 sur le même axe droit, sa courbe devenant quasi plate. Remplacée par une
 * normalisation par série à axe unique masqué. Le STC (en personnes et en DH) a ensuite été ajouté à
 * ces graphiques (4 séries au total) puis retiré (demande explicite de direction) : il reste
 * disponible dans les graphiques à barres, ce document-ci n'en garde que masse et effectif.
 */
public final class PaieReportEvolutionChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_MASSE = new Color(0x25, 0x63, 0xEB);
    private static final Color COULEUR_EFFECTIF = new Color(0xF5, 0x9E, 0x0B);
    private static final Color COULEUR_GRILLE = new Color(0xDD, 0xDD, 0xDD);
    private static final String SERIE_MASSE = "Masse (DH)";

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
        // Marges gauche ET droite généreuses : chaque point (pas seulement le dernier) porte une
        // étiquette, donc le premier mois peut avoir une étiquette "DH" qui s'étend vers la gauche
        // (hors du tracé si la marge est trop fine) tout comme le dernier mois peut avoir une
        // étiquette "Personnes" qui s'étend vers la droite.
        plot.setInsets(new RectangleInsets(20, 60, 20, 72));

        CategoryAxis categoryAxis = plot.getDomainAxis();
        categoryAxis.setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        categoryAxis.setCategoryLabelPositions(CategoryLabelPositions.UP_45);

        CategoryDataset original = plot.getDataset();
        if (original == null) {
            return;
        }

        // Vraies valeurs (avant normalisation), conservées pour l'étiquette — clé (série, catégorie).
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

        // Scinde le dataset unique (masse + effectif) en 2 datasets — un par axe — chaque valeur
        // normalisée à sa PROPRE série, voir la Javadoc de classe.
        DefaultCategoryDataset dsDh = new DefaultCategoryDataset();
        DefaultCategoryDataset dsPersonnes = new DefaultCategoryDataset();
        for (int row = 0; row < original.getRowCount(); row++) {
            String serie = String.valueOf(original.getRowKey(row));
            double max = maxParSerie.getOrDefault(serie, 0.0);
            DefaultCategoryDataset cible = SERIE_MASSE.equals(serie) ? dsDh : dsPersonnes;
            for (int col = 0; col < original.getColumnCount(); col++) {
                Number valeur = original.getValue(row, col);
                double normalisee = (valeur == null || max <= 0) ? 0 : valeur.doubleValue() / max;
                cible.addValue(normalisee, serie, original.getColumnKey(col));
            }
        }

        NumberAxis axeGauche = (NumberAxis) plot.getRangeAxis();
        axeGauche.setLabel("DH");
        axeGauche.setLabelFont(new Font("Liberation Serif", Font.BOLD, 8));
        axeGauche.setTickLabelsVisible(false);
        axeGauche.setTickMarksVisible(false);
        axeGauche.setVisible(true);
        plot.setDataset(0, dsDh);

        NumberAxis axeDroite = new NumberAxis("Personnes");
        axeDroite.setLabelFont(new Font("Liberation Serif", Font.BOLD, 8));
        axeDroite.setTickLabelsVisible(false);
        axeDroite.setTickMarksVisible(false);
        plot.setRangeAxis(1, axeDroite);
        plot.setDataset(1, dsPersonnes);
        plot.mapDatasetToRangeAxis(1, 1);

        LineAndShapeRenderer rendererDh = (LineAndShapeRenderer) plot.getRenderer(0);
        LineAndShapeRenderer rendererPersonnes = new LineAndShapeRenderer();
        plot.setRenderer(1, rendererPersonnes);

        styliser(rendererDh, dsDh, vraiesValeurs, COULEUR_MASSE, true,
                ItemLabelAnchor.OUTSIDE9, TextAnchor.CENTER_RIGHT);
        styliser(rendererPersonnes, dsPersonnes, vraiesValeurs, COULEUR_EFFECTIF, false,
                ItemLabelAnchor.OUTSIDE3, TextAnchor.CENTER_LEFT);
    }

    /** Style d'un renderer (1 par axe, 1 seule série chacun) — étiquette de valeur affichée sur
     * CHAQUE point (rapport imprimé, pas d'infobulle au survol), orientée vers l'axe de la série
     * (masse à gauche, effectif à droite). */
    private void styliser(LineAndShapeRenderer renderer, CategoryDataset dataset, Map<String, Map<String, Number>> vraiesValeurs,
                           Color couleur, boolean montant, ItemLabelAnchor ancre, TextAnchor texte) {
        for (int serie = 0; serie < dataset.getRowCount(); serie++) {
            renderer.setSeriesPaint(serie, couleur);
            renderer.setSeriesStroke(serie, new BasicStroke(2f));
            renderer.setSeriesShapesVisible(serie, true);
            renderer.setSeriesShape(serie, new Ellipse2D.Double(-2.5, -2.5, 5, 5));
            renderer.setSeriesOutlinePaint(serie, couleur);
            renderer.setUseFillPaint(true);
            renderer.setSeriesFillPaint(serie, Color.WHITE);

            renderer.setSeriesItemLabelsVisible(serie, Boolean.TRUE);
            renderer.setSeriesItemLabelFont(serie, new Font("Liberation Serif", Font.BOLD, 8));
            renderer.setSeriesItemLabelPaint(serie, couleur.darker());
            renderer.setSeriesItemLabelGenerator(serie, new StandardCategoryItemLabelGenerator(
                    "{2}", new DecimalFormat("#,##0")) {
                @Override
                public String generateLabel(CategoryDataset ds, int row, int column) {
                    String serieCourante = String.valueOf(ds.getRowKey(row));
                    Number valeur = vraiesValeurs.getOrDefault(serieCourante, Map.of())
                            .get(String.valueOf(ds.getColumnKey(column)));
                    if (valeur == null || valeur.doubleValue() == 0) {
                        return null;
                    }
                    return montant
                            ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue())) + " DH"
                            : PaieReportNumberFormat.entier(valeur.intValue());
                }
            });
            renderer.setSeriesPositiveItemLabelPosition(serie, new ItemLabelPosition(ancre, texte));
        }
    }
}
