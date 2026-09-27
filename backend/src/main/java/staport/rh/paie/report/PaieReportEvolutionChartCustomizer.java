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
 * Personnalise le {@code <lineChart>} JRXML d'évolution mensuelle (masse, effectif, STC en personnes
 * ET en montant — 4 séries) — un seul graphique par niveau (Global, Chantier, Équipe), demande
 * explicite de direction.
 *
 * <p><b>2 axes Y visibles comme repères d'unité, PAS comme échelle réelle</b> : demande explicite de
 * direction (« laisser les axes, au moins comme mesure d'unité, un pour personnes et l'autre pour
 * DH »). Axe gauche libellé "DH" (masse, STC en DH), axe droit libellé "Personnes" (effectif, STC en
 * personnes) — mais leurs graduations numériques restent masquées ({@code setTickLabelsVisible}/
 * {@code setTickMarksVisible} à {@code false}) : un double axe Y à échelle RÉELLE avait déjà été
 * tenté et écarté (voir historique ci-dessous), les 2 axes ici ne servent qu'à indiquer visuellement
 * quel côté du graphique regrouper mentalement, jamais à lire une valeur dessus.
 *
 * <p><b>Chaque série reste normalisée à sa PROPRE valeur maximale</b> (0 à 1, même technique que
 * {@link PaieReportGroupedChartCustomizer}), y compris entre les 2 séries d'une même famille
 * d'unité : regrouper masse/effectif par axe ne suffit pas à lui seul, l'effectif (ex. 969 personnes)
 * écraserait toujours le STC en personnes (ex. 37) s'ils partageaient une échelle commune, même sur
 * un axe purement décoratif. La forme/tendance de chaque courbe reste donc pleinement lisible quelle
 * que soit son échelle réelle, et la vraie valeur (jamais la valeur normalisée) reste affichée en
 * étiquette sur le dernier point de chaque série, lue dans une table conservée avant normalisation.
 *
 * <p><b>Étiquettes orientées vers leur axe</b> : familles DH (masse, STC en DH) étiquetées côté
 * GAUCHE du point, familles Personnes (effectif, STC en personnes) côté DROIT — demande explicite de
 * direction, pour ne plus faire cohabiter au même endroit une étiquette en DH et une en personnes
 * (constaté en production : les 2 valeurs du dernier mois se chevauchaient near le coin supérieur
 * droit). Au sein d'une même famille (2 séries maximum), alternance haut/bas pour limiter le risque
 * résiduel si les 2 séries de cette famille culminent au même mois.
 *
 * <p><b>Historique</b> : une 1ʳᵉ version à double axe Y RÉEL (masse à gauche, effectif + STC en
 * personnes à droite, partageant la même échelle) fonctionnait sur données synthétiques modestes mais
 * s'est révélée insuffisante sur données réelles — un effectif à ~969 personnes écrasait
 * visuellement un STC à ~37 sur le même axe droit, sa courbe devenant quasi plate. Remplacée par une
 * normalisation par série à axe unique masqué, qui a résolu la lisibilité mais, avec un historique
 * mensuel encore clairsemé (un seul mois de données réelles, les 11 précédents à 0), faisait
 * parfois coïncider exactement plusieurs séries au même point (0 partout puis 1 au dernier mois),
 * chevauchant leurs étiquettes de valeur. La version actuelle combine les 2 leçons : normalisation
 * par série (résout l'écart d'échelle) + répartition des étiquettes par famille d'unité gauche/droite
 * (résout le chevauchement).
 */
public final class PaieReportEvolutionChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_MASSE = new Color(0x25, 0x63, 0xEB);
    private static final Color COULEUR_EFFECTIF = new Color(0xF5, 0x9E, 0x0B);
    private static final Color COULEUR_STC_PERSONNES = new Color(0xEF, 0x44, 0x44);
    private static final Color COULEUR_STC_MONTANT = new Color(0x7F, 0x1D, 0x1D);
    private static final Color COULEUR_GRILLE = new Color(0xDD, 0xDD, 0xDD);
    private static final String SERIE_MASSE = "Masse (DH)";
    private static final String SERIE_EFFECTIF = "Effectif (personnes)";
    private static final String SERIE_STC_PERSONNES = "STC (personnes)";
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
        // Marge de droite généreuse : les étiquettes "Personnes" s'étendent vers la droite depuis un
        // point déjà situé sur la dernière catégorie (mois courant, bord droit du graphique) — sans
        // cette marge elles seraient tronquées. Marge de gauche plus fine : les étiquettes "DH"
        // s'étendent vers l'intérieur du graphique, jamais vers son bord.
        plot.setInsets(new RectangleInsets(20, 8, 20, 72));

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

        // Scinde le dataset unique (4 séries) en 2 familles d'unité — chaque valeur reste normalisée
        // à sa PROPRE série (pas à sa famille), voir la Javadoc de classe.
        DefaultCategoryDataset dsDh = new DefaultCategoryDataset();
        DefaultCategoryDataset dsPersonnes = new DefaultCategoryDataset();
        for (int row = 0; row < original.getRowCount(); row++) {
            String serie = String.valueOf(original.getRowKey(row));
            double max = maxParSerie.getOrDefault(serie, 0.0);
            DefaultCategoryDataset cible = estFamilleDh(serie) ? dsDh : dsPersonnes;
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

        styliser(rendererDh, dsDh, vraiesValeurs);
        styliser(rendererPersonnes, dsPersonnes, vraiesValeurs);
    }

    private boolean estFamilleDh(String serie) {
        return SERIE_MASSE.equals(serie) || SERIE_STC_MONTANT.equals(serie);
    }

    /** Style commun aux 2 renderers (1 par famille d'unité, 2 séries chacun au plus) — étiquette de
     * valeur affichée uniquement sur le dernier point de chaque série (mois courant), orientée vers
     * l'axe de sa famille, alternée haut/bas au sein de la famille. */
    private void styliser(LineAndShapeRenderer renderer, CategoryDataset dataset, Map<String, Map<String, Number>> vraiesValeurs) {
        for (int serie = 0; serie < dataset.getRowCount(); serie++) {
            String cle = String.valueOf(dataset.getRowKey(serie));
            boolean montant = SERIE_MASSE.equals(cle) || SERIE_STC_MONTANT.equals(cle);
            boolean gauche = estFamilleDh(cle);
            boolean premiereDeSaFamille = SERIE_MASSE.equals(cle) || SERIE_EFFECTIF.equals(cle);
            Color couleur = couleurDe(cle);

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
                    if (column != ds.getColumnCount() - 1) {
                        return null;
                    }
                    String serieCourante = String.valueOf(ds.getRowKey(row));
                    Number valeur = vraiesValeurs.getOrDefault(serieCourante, Map.of())
                            .get(String.valueOf(ds.getColumnKey(column)));
                    if (valeur == null) {
                        return null;
                    }
                    return montant
                            ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue())) + " DH"
                            : PaieReportNumberFormat.entier(valeur.intValue());
                }
            });
            ItemLabelAnchor ancre;
            TextAnchor texte;
            if (gauche) {
                ancre = premiereDeSaFamille ? ItemLabelAnchor.OUTSIDE10 : ItemLabelAnchor.OUTSIDE8;
                texte = premiereDeSaFamille ? TextAnchor.BOTTOM_RIGHT : TextAnchor.TOP_RIGHT;
            } else {
                ancre = premiereDeSaFamille ? ItemLabelAnchor.OUTSIDE2 : ItemLabelAnchor.OUTSIDE4;
                texte = premiereDeSaFamille ? TextAnchor.BOTTOM_LEFT : TextAnchor.TOP_LEFT;
            }
            renderer.setSeriesPositiveItemLabelPosition(serie, new ItemLabelPosition(ancre, texte));
        }
    }

    private Color couleurDe(String serie) {
        if (SERIE_MASSE.equals(serie)) {
            return COULEUR_MASSE;
        }
        if (SERIE_STC_MONTANT.equals(serie)) {
            return COULEUR_STC_MONTANT;
        }
        return SERIE_STC_PERSONNES.equals(serie) ? COULEUR_STC_PERSONNES : COULEUR_EFFECTIF;
    }
}
