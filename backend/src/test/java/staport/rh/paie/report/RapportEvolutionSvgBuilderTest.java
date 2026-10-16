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

        new RapportEvolutionSvgBuilder().ajouterGraphique(corps, donnees, PageModel.MesureEvolution.MASSE);

        assertThat(corps.select(".evolution-container svg")).hasSize(1);
        assertThat(corps.select(".evolution-container path")).hasSize(1);
        assertThat(corps.select(".evolution-container circle")).hasSize(2);
        assertThat(corps.text().replace('\u00A0', ' ')).contains("1/2026", "2/2026", "120 000 DH");
    }

    @Test
    void ajouterGraphique_sansMoisNaffichePasUneCourbeNulle() {
        Element corps = Document.createShell("").body();

        new RapportEvolutionSvgBuilder().ajouterGraphique(corps, List.of(), PageModel.MesureEvolution.MASSE);

        assertThat(corps.select("svg")).isEmpty();
        assertThat(corps.text()).contains("Aucune donnée historique disponible");
    }
}
