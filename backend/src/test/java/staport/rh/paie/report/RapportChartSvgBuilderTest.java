package staport.rh.paie.report;

import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
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
        assertThat(svg.tag().namespace()).isEqualTo(Parser.NamespaceSvg);
        assertThat(svg.selectFirst("g").tag().namespace()).isEqualTo(Parser.NamespaceSvg);
    }

    /** Un graphique réparti sur plusieurs pages passe l'ensemble des lignes comme échelle : une même valeur doit
     * donner une barre plus courte quand l'ensemble contient une valeur bien plus grande. */
    @Test
    void ajouterGraphique_doitCalerLesBarresSurLEchelleFournie() {
        RepartitionBean petit = new RepartitionBean("C001", 10, new BigDecimal("1000.00"), 0, BigDecimal.ZERO);
        RepartitionBean grand = new RepartitionBean("C002", 10, new BigDecimal("4000.00"), 0, BigDecimal.ZERO);

        Document seul = Document.createShell("");
        builder.ajouterGraphique(seul.body().appendElement("div"), List.of(petit));
        Document surEchelleCommune = Document.createShell("");
        builder.ajouterGraphique(surEchelleCommune.body().appendElement("div"), List.of(petit), List.of(petit, grand));

        double largeurSeul = largeurBarreMasse(seul);
        double largeurCommune = largeurBarreMasse(surEchelleCommune);
        assertThat(largeurCommune).isCloseTo(largeurSeul / 4, org.assertj.core.data.Offset.offset(0.02));
    }

    /** Largeur de la barre « Masse » (bleue) : les autres rectangles bleus sont le filet d'en-tête (2,5 pt de haut)
     * et la pastille de légende (8 pt). */
    private double largeurBarreMasse(Document doc) {
        return doc.select("rect[fill=#2563EB]").stream()
                .filter(rect -> !rect.attr("height").equals("2.5") && !rect.attr("height").equals("8"))
                .mapToDouble(rect -> Double.parseDouble(rect.attr("width")))
                .findFirst().orElseThrow();
    }

    @Test
    void ajouterGraphique_neDoitRienAfficherPourUneListeVide() {
        Document doc = Document.createShell("");
        Element corps = doc.body().appendElement("div");
        builder.ajouterGraphique(corps, List.of());

        assertThat(doc.select("svg")).isEmpty();
    }

    /** Un nom de chantier peut compter jusqu'à 255 caractères : il passe sur plusieurs lignes, sans rien perdre. */
    @Test
    void ajouterGraphique_doitFaireDescendreUnLibelleTropLongSurPlusieursLignes() {
        String nomTresLong = "AVENUE MY ABD ELLAH MARRAKECH - TRAVAUX D'ASSAINISSEMENT ET DE VOIRIE DE LA ZONE INDUSTRIELLE";
        Document doc = Document.createShell("");
        Element corps = doc.body().appendElement("div");

        builder.ajouterGraphique(corps, List.of(new RepartitionBean(nomTresLong, 74, new BigDecimal("444000.00"), 0, BigDecimal.ZERO)));

        List<String> lignes = doc.select("text[font-size=9.5]").stream().map(Element::text).toList();
        assertThat(lignes).hasSizeGreaterThan(1);
        assertThat(String.join(" ", lignes)).isEqualTo(nomTresLong).doesNotContain("…");
    }

    @Test
    void ajouterGraphique_neDoitPasCouperUnLibelleCourt() {
        Document doc = Document.createShell("");
        Element corps = doc.body().appendElement("div");

        builder.ajouterGraphique(corps, List.of(new RepartitionBean("Nador", 74, new BigDecimal("444000.00"), 0, BigDecimal.ZERO)));

        assertThat(doc.body().text()).contains("Nador").doesNotContain("…");
    }
}
