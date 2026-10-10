package staport.rh.paie.report;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Le corps JSON du rapport PDF se désérialise avec le constructeur canonique du record (et non avec le constructeur de
 * compatibilité à sept arguments) : {@code sansVueEnsemble} est lu quand il est présent, faux quand il est absent.
 */
class PaieReportPdfRequestDtoTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void sansVueEnsembleEtChantierSontLusDuCorpsJson() throws Exception {
        PaieReportPdfRequestDto requete = mapper.readValue(
                "{\"periode\":\"2026-09\",\"chantierId\":3,\"sansVueEnsemble\":true}", PaieReportPdfRequestDto.class);

        assertThat(requete.periode()).isEqualTo("2026-09");
        assertThat(requete.chantierId()).isEqualTo(3L);
        assertThat(requete.vueEnsembleRetiree()).isTrue();
    }

    @Test
    void uneRequeteHistoriqueSansLeChampGardeLeRapportComplet() throws Exception {
        PaieReportPdfRequestDto requete = mapper.readValue("{\"periode\":\"2026-09\"}", PaieReportPdfRequestDto.class);

        assertThat(requete.vueEnsembleRetiree()).isFalse();
        assertThat(requete.chantierId()).isNull();
    }
}
