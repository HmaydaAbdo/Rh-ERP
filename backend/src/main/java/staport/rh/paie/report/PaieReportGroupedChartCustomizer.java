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
 * Personnalise les {@code <barChart>} JRXML à barres groupées HORIZONTALES (4 séries : Masse (DH),
 * Effectif (personnes), STC (personnes), STC (DH) — chaque série de la légende porte son unité,
 * demande explicite de direction) — chapitre II (répartition par chantier) et répartition par équipe
 * au niveau chantier. Convention retenue après retour direction : un double axe X numérique (DH vs
 * personnes) a été jugé trop risqué à fiabiliser côté JFreeChart pour des barres groupées — l'axe des
 * valeurs reste donc **masqué**, chaque barre affichant directement sa valeur exacte.
 *
 * <p><b>Normalisation par série (pas seulement un axe masqué)</b> : masse/STC en DH (milliers de DH)
 * et effectif/STC en personnes (quelques unités) ont des ordres de grandeur si différents qu'un
 * simple axe masqué ne suffit pas — les 4 séries restent dessinées sur la MÊME échelle linéaire
 * sous-jacente, ce qui rend les barres personnes visuellement nulles à côté des barres DH (constaté
 * en production : seules les étiquettes "5"/"1" étaient visibles, la barre elle-même large de
 * quelques pixels contre l'axe). Ce customizer construit donc un dataset de tracé où chaque série est
 * ramenée à sa propre valeur maximale (0 à 1, indépendamment des 3 autres séries) — la longueur d'une
 * barre reste significative pour COMPARER cette série entre catégories (ex. quel chantier a le plus
 * de STC), mais plus jamais pour comparer 2 séries différentes entre elles (ce qui n'aurait de toute
 * façon aucun sens entre DH et personnes). L'étiquette affichée sur chaque barre reste la vraie
 * valeur (jamais la valeur normalisée), lue dans une table à part conservée avant normalisation.
 *
 * <p><b>Marges resserrées pour 4 barres par catégorie</b> : la hauteur d'un {@code <barChart>} de ce
 * rapport est plafonnée par la contrainte "un seul graphique par page" (jusqu'à {@code
 * PaieBiReportBuilder.MAX_BARRES_GRAPHIQUE} + "Autres" catégories sur une hauteur de page fixe,
 * environ 430px de tracé utile) — passer de 3 à 4 séries par catégorie sans réduire les marges
 * aurait rendu chaque barre encore plus fine (constaté en production avec les marges précédentes,
 * 0.35/0.15 : les 3 barres d'un même chantier se touchaient déjà et leurs étiquettes débordaient sur
 * la catégorie voisine). Les marges ci-dessous (voir {@code categoryMargin}/{@code itemMargin})
 * privilégient donc la taille des barres elles-mêmes sur l'espacement entre catégories.
 */
public final class PaieReportGroupedChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_MASSE = new Color(0x25, 0x63, 0xEB);
    private static final Color COULEUR_EFFECTIF = new Color(0xF5, 0x9E, 0x0B);
    private static final Color COULEUR_STC = new Color(0xB9, 0x1C, 0x1C);
    private static final Color COULEUR_STC_MONTANT = new Color(0x7F, 0x1D, 0x1D);
    private static final String SERIE_MASSE = "Masse (DH)";
    private static final String SERIE_STC = "STC (personnes)";
    private static final String SERIE_STC_MONTANT = "STC (DH)";
    // La barre au maximum de sa série n'atteint jamais 100% de la largeur du tracé — sans cette
    // marge, son étiquette (dessinée hors-barre, juste après sa pointe) se retrouve à la toute
    // limite du canevas de l'image du graphique et se fait tronquer par son bord, quel que soit
    // l'inset du plot par ailleurs (constaté en production : les derniers caractères d'un gros
    // montant disparaissaient, y compris avec un inset droit déjà généreux — le problème n'est donc
    // pas l'espace après la barre mais la position de la barre elle-même).
    private static final double ECHELLE_MAX = 0.82;

    @Override
    public void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setOrientation(PlotOrientation.HORIZONTAL);
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2, 0xE8, 0xF0));
        // Marge de droite : la vraie protection contre le rognage de l'étiquette est ECHELLE_MAX
        // ci-dessous (la barre au maximum ne touche jamais le bord du tracé) — cet inset n'est qu'un
        // confort supplémentaire pour l'étiquette de l'effectif/STC (entiers courts).
        plot.setInsets(new RectangleInsets(4, 4, 4, 70));
        plot.getDomainAxis().setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 9));
        plot.getDomainAxis().setCategoryLabelPositions(CategoryLabelPositions.STANDARD);
        plot.getRangeAxis().setVisible(false);

        // 4 barres par catégorie (masse/effectif/STC personnes/STC DH) sur une hauteur de page fixe :
        // la marge ENTRE catégories (categoryMargin) doit rester modeste pour laisser le plus de
        // hauteur possible aux 4 barres elles-mêmes, quitte à réduire un peu l'espace visuel entre
        // chantiers/équipes successifs — l'inverse (0.35 avec seulement 3 séries) rendait les barres
        // trop fines et leurs étiquettes débordaient sur la catégorie voisine (constaté en
        // production). itemMargin (espace entre les 4 barres d'un même groupe) reste suffisant pour
        // les distinguer visuellement sans sacrifier leur épaisseur.
        CategoryAxis categoryAxis = (CategoryAxis) plot.getDomainAxis();
        categoryAxis.setCategoryMargin(0.16);
        categoryAxis.setLowerMargin(0.01);
        categoryAxis.setUpperMargin(0.01);

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
                double normalisee = (valeur == null || max <= 0) ? 0 : valeur.doubleValue() / max * ECHELLE_MAX;
                normalise.addValue(normalisee, serie, original.getColumnKey(col));
            }
        }
        plot.setDataset(normalise);

        BarRenderer renderer = (BarRenderer) plot.getRenderer();
        renderer.setShadowVisible(false);
        renderer.setDrawBarOutline(true);
        renderer.setItemMargin(0.10);

        // Étiquette de valeur à l'extérieur de chaque barre, jamais à l'intérieur — lit la VRAIE
        // valeur dans la table conservée avant normalisation, jamais la valeur normalisée réellement
        // tracée. Formatage
        // différent selon la série : montant en DH pour la masse et le STC en DH, entier brut pour
        // l'effectif et le STC en personnes (nombre de personnes, jamais d'unité). Aucune étiquette
        // pour une valeur exactement nulle (demande explicite de direction) : la barre est de toute
        // façon invisible (longueur nulle), inutile d'empiler un "0"/"0,00" par-dessus celui de la
        // série voisine — son absence dit déjà "zéro" sans ambiguïté.
        StandardCategoryItemLabelGenerator generateur = new StandardCategoryItemLabelGenerator(
                "{2}", new DecimalFormat("#,##0")) {
            @Override
            public String generateLabel(CategoryDataset dataset, int row, int column) {
                String serie = String.valueOf(dataset.getRowKey(row));
                String categorie = String.valueOf(dataset.getColumnKey(column));
                Number valeur = vraiesValeurs.getOrDefault(serie, Map.of()).get(categorie);
                if (valeur == null || valeur.doubleValue() == 0) {
                    return null;
                }
                boolean montant = SERIE_MASSE.equals(serie) || SERIE_STC_MONTANT.equals(serie);
                return montant
                        ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue()))
                        : PaieReportNumberFormat.entier(valeur.intValue());
            }
        };

        int nbSeries = normalise.getRowCount();
        for (int serie = 0; serie < nbSeries; serie++) {
            String cle = String.valueOf(normalise.getRowKey(serie));
            Color couleur = couleurDe(cle);
            renderer.setSeriesPaint(serie, couleur);
            renderer.setSeriesOutlinePaint(serie, couleur.darker());
            renderer.setSeriesOutlineStroke(serie, new BasicStroke(1f));
            renderer.setSeriesItemLabelsVisible(serie, Boolean.TRUE);
            renderer.setSeriesItemLabelFont(serie, new Font("Liberation Serif", Font.BOLD, 7));
            renderer.setSeriesItemLabelPaint(serie, Color.BLACK);
            renderer.setSeriesPositiveItemLabelPosition(serie,
                    new ItemLabelPosition(ItemLabelAnchor.OUTSIDE3, TextAnchor.CENTER_LEFT));
            renderer.setSeriesItemLabelGenerator(serie, generateur);
        }
    }

    private Color couleurDe(String serie) {
        if (SERIE_MASSE.equals(serie)) {
            return COULEUR_MASSE;
        }
        if (SERIE_STC.equals(serie)) {
            return COULEUR_STC;
        }
        return SERIE_STC_MONTANT.equals(serie) ? COULEUR_STC_MONTANT : COULEUR_EFFECTIF;
    }
}
