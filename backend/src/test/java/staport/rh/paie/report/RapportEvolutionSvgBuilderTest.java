package staport.rh.paie.report;

import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class RapportEvolutionSvgBuilderTest {

    @Test
    void ajouterGraphique_afficheLesMoisDisponiblesEtLeursValeurs() {
        Element corps = Document.createShell("").body();
        List<RepartitionBean> donnees = List.of(
                new RepartitionBean("1/2026", 10, new BigDecimal("90000"), 1, new BigDecimal("10000")),
                new RepartitionBean("2/2026", 12, new BigDecimal("120000"), 0, BigDecimal.ZERO));

        new RapportEvolutionSvgBuilder().ajouterGraphique(corps, donnees, PageModel.GroupeEvolution.MONTANTS,
                RapportEvolutionSvgBuilder.HAUTEUR_COMPACTE);

        assertThat(corps.select(".evolution-container svg")).hasSize(1);
        assertThat(corps.select(".evolution-container path")).hasSize(2);
        assertThat(corps.select(".evolution-container circle[stroke]")).hasSize(4);
        assertThat(corps.text().replace('\u00A0', ' '))
                .contains("1/2026", "2/2026", "120 000", "Masse salariale · DH", "Montants des STC · DH");
        assertThat(corps.select(".evolution-container svg").attr("aria-label"))
                .contains("Masse salariale et Montants des STC");
        assertThat(corps.select(".evolution-container line[stroke-dasharray='2 2']")).hasSize(8);
        assertThat(corps.select(".evolution-container text").eachText())
                .contains("DH").doesNotContain("personnes");
        assertThat(corps.select(".evolution-container svg text[x^=74]")).hasSize(5);
        assertThat(corps.select(".evolution-container line[stroke='#40566B']")).hasSize(2);
        assertThat(corps.select(".evolution-container path").eachAttr("stroke"))
                .containsExactly("#2563EB", "#0F766E");
    }

    @Test
    void ajouterGraphique_effectifsRegroupeLesPersonnesEtUtiliseUneEchelleCommune() {
        Element corps = Document.createShell("").body();
        List<RepartitionBean> donnees = List.of(
                new RepartitionBean("1/2026", 10, new BigDecimal("90000"), 2, new BigDecimal("10000")),
                new RepartitionBean("2/2026", 12, new BigDecimal("120000"), 1, new BigDecimal("18000")));

        new RapportEvolutionSvgBuilder().ajouterGraphique(corps, donnees, PageModel.GroupeEvolution.EFFECTIFS,
                RapportEvolutionSvgBuilder.HAUTEUR_COMPACTE);

        assertThat(corps.select(".evolution-container path").eachAttr("stroke"))
                .containsExactly("#D97706", "#B91C1C");
        assertThat(corps.text().replace('\u00A0', ' '))
                .contains("Effectif rémunéré · personnes", "Sorties du personnel (STC) · personnes", "12", "2/2026");
        assertThat(corps.select(".evolution-container svg").attr("aria-label"))
                .contains("Effectif rémunéré et Sorties du personnel");
        assertThat(corps.select(".evolution-container text").eachText())
                .contains("personnes").doesNotContain("DH");
        assertThat(corps.select(".evolution-container svg text[x^=74]")).hasSize(5);
        // L'effectif maximal (12) fixe aussi la position de 6 sorties à la moitié de la hauteur utile.
        Element labelEffectif = corps.selectFirst("text.evolution-valeur[data-serie=0][data-index=1]");
        Element labelSorties = corps.selectFirst("text.evolution-valeur[data-serie=1][data-index=1]");
        assertThat(labelEffectif).isNotNull();
        assertThat(labelSorties).isNotNull();
        assertThat(Double.parseDouble(labelEffectif.attr("y")))
                .isNotEqualTo(Double.parseDouble(labelSorties.attr("y")));
        assertThat(corps.select(".evolution-container line[stroke='#40566B']")).hasSize(2);
    }

    @Test
    void ajouterGraphique_sansMoisNaffichePasUneCourbeNulle() {
        Element corps = Document.createShell("").body();

        new RapportEvolutionSvgBuilder().ajouterGraphique(corps, List.of(), PageModel.GroupeEvolution.MONTANTS,
                RapportEvolutionSvgBuilder.HAUTEUR_COMPACTE);

        assertThat(corps.select("svg")).isEmpty();
        assertThat(corps.text()).contains("Aucune donnée historique disponible");
    }

    @Test
    void ajouterGraphique_decaleLesEtiquettesDesAxesEtSepareLesSeriesAuxMemesNiveaux() {
        Element corps = Document.createShell("").body();
        List<RepartitionBean> donnees = List.of(
                new RepartitionBean("8/2026", 1, BigDecimal.ZERO, 50, new BigDecimal("100000")),
                new RepartitionBean("9/2026", 1, BigDecimal.ZERO, 50, new BigDecimal("100000")));

        new RapportEvolutionSvgBuilder().ajouterGraphique(corps, donnees, PageModel.GroupeEvolution.EFFECTIFS,
                RapportEvolutionSvgBuilder.HAUTEUR_COMPACTE);

        for (int index = 0; index < donnees.size(); index++) {
            List<Element> labels = corps.select("text.evolution-valeur[data-index=" + index + "]");
            assertThat(labels).hasSize(2);
            double y0 = Double.parseDouble(labels.get(0).attr("y"));
            double y1 = Double.parseDouble(labels.get(1).attr("y"));
            assertThat(Math.abs(y0 - y1)).isGreaterThanOrEqualTo(9);
        }

        List<Element> premiers = corps.select("text.evolution-valeur[data-index=0]");
        List<Element> derniers = corps.select("text.evolution-valeur[data-index=1]");
        assertThat(premiers).allSatisfy(label -> assertThat(Double.parseDouble(label.attr("x"))).isGreaterThan(82));
        assertThat(derniers).allSatisfy(label -> assertThat(Double.parseDouble(label.attr("x"))).isLessThan(720));
    }
}
