package staport.rh.paie.report;

import net.sf.jasperreports.engine.JRChart;
import net.sf.jasperreports.engine.JRChartCustomizer;
import org.jfree.chart.JFreeChart;
import org.jfree.chart.axis.CategoryLabelPositions;
import org.jfree.chart.labels.ItemLabelAnchor;
import org.jfree.chart.labels.ItemLabelPosition;
import org.jfree.chart.labels.StandardCategoryItemLabelGenerator;
import org.jfree.chart.axis.CategoryAxis;
import org.jfree.chart.axis.NumberAxis;
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
 * Personnalise les 4 {@code <barChart>} JRXML à série unique de la vue détaillée par chantier
 * (masse/effectif par équipe, masse/effectif par fonction) — colonnes VERTICALES, jamais de
 * camembert/donut (voir {@code docs/report/README.md}, section « Visualisations »). Convention du
 * document : toutes les répartitions catégorielles sont désormais des colonnes verticales (voir
 * aussi {@link PaieReportStackedChartCustomizer} pour les {@code <stackedBarChart>} du chapitre II,
 * empilés par équipe) — seuls ces 4 graphiques restent à série unique, sans dimension supplémentaire
 * à empiler. L'orientation du plot n'est pas déclarable dans le schéma JRXML (contrairement aux
 * couleurs/légende, portées par le style du {@code <barChart>} lui-même) — seule personnalisation qui
 * nécessite ce customizer Java. Classe publique : instanciée par réflexion par le moteur
 * JasperReports au rendu (voir {@code customizerClass} dans le JRXML).
 */
public final class PaieReportChartCustomizer implements JRChartCustomizer {

    private static final Color COULEUR_BARRE = new Color(0x25, 0x63, 0xEB);
    private static final String SERIE_MASSE = "Masse (DH)";

    @Override
    public void customize(JFreeChart chart, JRChart jrChart) {
        chart.setBackgroundPaint(Color.WHITE);
        chart.setBorderVisible(false);

        CategoryPlot plot = chart.getCategoryPlot();
        plot.setOrientation(PlotOrientation.VERTICAL);
        plot.setBackgroundPaint(Color.WHITE);
        plot.setOutlineVisible(false);
        plot.setRangeGridlinePaint(new Color(0xE2, 0xE8, 0xF0));
        // Marge du haut généreuse : l'étiquette de valeur est à l'extérieur de la colonne (voir plus
        // bas, au-dessus de son sommet), il lui faut de la place même pour la plus grosse valeur du
        // graphique — jamais un montant tronqué en haut de page. Ces graphiques sont plus bas (120pt,
        // budget de page oblige, voir rapport.jrxml GroupChantier/GroupChantierFonction) que ceux de
        // la Synthèse globale ou du chapitre II : un pourcentage de marge appliqué à une hauteur de
        // tracé plus petite laisse mécaniquement moins de pixels réels à l'étiquette (constaté en
        // production, chiffres encore rognés avec 20pt + 18% de marge) — d'où un inset fixe plus
        // généreux ET une marge haute de l'axe plus importante ci-dessous.
        plot.setInsets(new RectangleInsets(34, 4, 4, 4));
        plot.getDomainAxis().setTickLabelFont(new Font("Liberation Serif", Font.PLAIN, 8));
        // Rotation à 30° (pas 45°) : un libellé de fonction/équipe peut être plus long qu'un simple
        // code chantier (ex. "Sans équipe"), un axe STANDARD (horizontal) se chevaucherait avec ses
        // voisins — mais ces graphiques sont bas (120pt, budget de page oblige) : une rotation à 45°
        // fait consommer par la projection verticale du libellé une part du peu de hauteur disponible,
        // au détriment de la marge réservée à l'étiquette de valeur au sommet de chaque colonne
        // (constaté en production : l'étiquette de valeur se remettait à être rognée dès que la
        // troncature du libellé de catégorie était supprimée ci-dessous). 30° suffit à séparer des
        // libellés courts sans consommer autant de hauteur.
        plot.getDomainAxis().setCategoryLabelPositions(CategoryLabelPositions.createUpRotationLabelPositions(Math.PI / 6));
        // Sans ceci, JFreeChart tronque avec "..." dès qu'un libellé (ex. "Sans équipe") dépasse une
        // largeur calculée par défaut trop stricte pour un texte incliné — constaté en production
        // ("Sa...", "EQU..."). Une limite large (2x la largeur d'une catégorie) désactive en pratique
        // la troncature sans autoriser un débordement incontrôlé.
        ((CategoryAxis) plot.getDomainAxis()).setMaximumCategoryLabelWidthRatio(2.0f);
        plot.getRangeAxis().setVisible(false);
        // Marge haute de l'axe des valeurs (invisible, mais sa plage détermine la hauteur des
        // colonnes) : sans elle, la colonne la plus haute atteint quasiment le sommet du plot et son
        // étiquette (au-dessus, voir plus bas) déborde hors de la zone de dessin malgré les insets —
        // constaté en production (étiquette de la plus grosse valeur tronquée en haut de graphique).
        // 18% de marge garantit la place nécessaire quel que soit le nombre de chiffres du montant.
        if (plot.getRangeAxis() instanceof NumberAxis axeValeurs) {
            axeValeurs.setUpperMargin(0.38);
        }

        // Colonnes épaisses et peu espacées : au plus 20 catégories (voir
        // PaieBiReportBuilder.MAX_BARRES_GRAPHIQUE, plafond partagé avec les distributions
        // intra-chantier), la marge entre catégories peut donc rester très faible sans jamais
        // compresser les colonnes visuellement, même sur les 390pt d'un graphique côte à côte.
        CategoryAxis categoryAxis = (CategoryAxis) plot.getDomainAxis();
        categoryAxis.setCategoryMargin(0.05);
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
        // Étiquette de valeur à l'extérieur de la colonne, jamais à l'intérieur (une colonne courte —
        // petite valeur — est parfois trop étroite/basse pour contenir son étiquette, qui
        // disparaîtrait silencieusement si elle restait centrée dedans). OUTSIDE12 place le point
        // d'ancrage au-dessus du RECTANGLE de la barre en coordonnées écran, quelle que soit
        // l'orientation du plot (voir la même remarque dans PaieReportStackedChartCustomizer et
        // l'historique Git : ce même ancrage était incorrect pour une barre HORIZONTAL, il fait
        // déborder l'étiquette de la barre la plus haute hors du graphique) — pour une colonne
        // VERTICAL, "au-dessus" est exactement la position correcte, la colonne la plus haute ayant
        // sa marge dédiée en haut du plot (voir setInsets ci-dessus). BOTTOM_CENTER centre le texte
        // horizontalement sur le sommet de la colonne. Suffixe "DH" retiré de chaque étiquette
        // (répétitif sur 20 colonnes) : indiqué une seule fois dans le sous-titre du graphique (voir
        // rapport.jrxml). Texte noir (fond blanc, plus de contraste blanc-sur-bleu nécessaire).
        // Réglages au niveau de la série (pas des setters "base" dépréciés) : le thème par défaut de
        // JasperReports positionne déjà une visibilité par série avant l'appel de ce customizer, qui
        // prime sinon silencieusement sur setItemLabelsVisible(true) et empêche tout affichage.
        renderer.setSeriesItemLabelsVisible(0, Boolean.TRUE);
        renderer.setSeriesItemLabelFont(0, new Font("Liberation Serif", Font.BOLD, 9));
        renderer.setSeriesItemLabelPaint(0, Color.BLACK);
        renderer.setSeriesPositiveItemLabelPosition(0, new ItemLabelPosition(ItemLabelAnchor.OUTSIDE12, TextAnchor.BOTTOM_CENTER));
        renderer.setSeriesItemLabelGenerator(0, new StandardCategoryItemLabelGenerator("{2}", new DecimalFormat("#,##0")) {
            @Override
            public String generateLabel(CategoryDataset dataset, int row, int column) {
                Number valeur = dataset.getValue(row, column);
                return masse
                        ? PaieReportNumberFormat.montant(BigDecimal.valueOf(valeur.doubleValue()))
                        : PaieReportNumberFormat.entier(valeur.intValue());
            }
        });
    }

    private boolean estSerieMasse(CategoryDataset dataset) {
        return dataset.getRowCount() > 0 && SERIE_MASSE.equals(String.valueOf(dataset.getRowKey(0)));
    }
}
