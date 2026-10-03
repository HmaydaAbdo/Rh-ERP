package staport.rh.paie.report;

import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Test de non-régression pour l'incident de production historique #2 (2026-09-25, ancien pipeline
 * HTML pré-JasperReports) : {@code paie.getObservation()} transmis tel quel à un gabarit sans
 * null-check affichait la chaîne littérale {@code "null"} dans le PDF. {@link RepartitionBean}
 * est le SEUL endroit de toute la vue-modèle où une valeur affichable ({@code montant}/
 * {@code stcMontant}) peut être {@code null} (voir le Javadoc de {@link RapportChartSvgBuilder}) —
 * ce test vérifie que {@link RapportChartSvgBuilder} ne reproduit jamais cet incident. */
class RapportChartSvgBuilderTest {

    private final RapportChartSvgBuilder builder = new RapportChartSvgBuilder();

    @Test
    void ajouterGraphique_neDoitJamaisAfficherLaChaineNullPourUnMontantNull() {
        RepartitionBean ligneAvecMontantsNulls = new RepartitionBean("C999", 3, null, 0, null);
        RepartitionBean ligneNormale = new RepartitionBean("C168", 74, new BigDecimal("444000.00"), 0, BigDecimal.ZERO);

        Document doc = Document.createShell("");
        Element corps = doc.body().appendElement("div");
        builder.ajouterGraphique(corps, List.of(ligneAvecMontantsNulls, ligneNormale));

        String texteComplet = doc.body().text();
        assertThat(texteComplet).doesNotContainIgnoringCase("null");
        // La catégorie à montants nuls doit quand même apparaître (son libellé et son effectif ne
        // sont pas nuls), seules les barres Masse/STC(DH) sont absentes pour elle.
        assertThat(texteComplet).contains("C999");
    }

    /** Non-régression : le moteur de rendu dimensionne le SVG d'après son viewBox (en px, 1 px = 0,75 pt) et
     * ignore width/height ; le dessin (en pt) doit donc être agrandi de 4/3 pour occuper toute la largeur utile
     * de la page (802 pt = 1069,33 px). Avant correction, le graphique n'en occupait que les trois quarts. */
    @Test
    void ajouterGraphique_doitOccuperToutLaLargeurUtileDeLaPage() {
        Document doc = Document.createShell("");
        Element corps = doc.body().appendElement("div");
        builder.ajouterGraphique(corps, List.of(new RepartitionBean("C168", 74, new BigDecimal("444000.00"), 0, BigDecimal.ZERO)));

        Element svg = doc.selectFirst("svg");
        assertThat(svg.attr("viewBox")).startsWith("0 0 1069.33 ");
        assertThat(svg.attr("width")).isEqualTo("1069.33px");
        assertThat(svg.selectFirst("g").attr("transform")).startsWith("scale(1.33");
    }

    @Test
    void ajouterGraphique_neDoitRienAfficherPourUneListeVide() {
        Document doc = Document.createShell("");
        Element corps = doc.body().appendElement("div");
        builder.ajouterGraphique(corps, List.of());

        assertThat(doc.select("svg")).isEmpty();
    }
}
