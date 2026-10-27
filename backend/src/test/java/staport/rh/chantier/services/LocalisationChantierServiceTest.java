package staport.rh.chantier.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.entities.NatureChantier;
import staport.rh.chantier.exceptions.ChantierLocalisationException;
import java.math.BigDecimal;
import static org.assertj.core.api.Assertions.*;

class LocalisationChantierServiceTest {
    private final LocalisationChantierService service = new LocalisationChantierService();

    private Chantier chantier() {
        Chantier chantier = new Chantier();
        chantier.setNature(NatureChantier.AO);
        return chantier;
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "google.com/maps?q=12.12345678,-34.12345678&z=17&hl=fr",
            "https://www.google.com/maps?q=12.12345678%2C-34.12345678",
            "https://www.google.com/maps/search/?api=1&query=12.12345678,-34.12345678"
    })
    void extrait_le_point_et_normalise_le_lien_sans_perdre_les_huit_decimales(String lien) {
        Chantier chantier = chantier();
        service.appliquer(chantier, lien, null, null, true);
        assertThat(chantier.getLatitude()).isEqualByComparingTo("12.12345678");
        assertThat(chantier.getLongitude()).isEqualByComparingTo("-34.12345678");
        assertThat(chantier.getLocalisation()).isEqualTo("https://www.google.com/maps/search/?api=1&query=12.12345678,-34.12345678");
        assertThat(chantier.isAfficherSurCarte()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "https://google.com.evil.test/maps?q=10,20", "http://google.com/maps?q=10,20",
            "https://example.test/maps?q=10,20", "https://user@google.com/maps?q=10,20",
            "https://google.com:8443/maps?q=10,20", "https://google.com/maps?q=10,20#secret",
            "https://goo.gl/maps/exemple", "https://www.google.com/maps?q=une-adresse",
            "https://www.google.com/maps?q=10,20&q=30,40", "https://google.com/maps?q=10,20&query=30,40",
            "https://google.com/maps?q=91,20", "https://google.com/maps?q=10,-181",
            "https://google.com/maps?q=NaN,20", "https://google.com/maps?q=10.123456789,20",
            "https://google.com/maps?q=10,20,30", "https://google.com/maps?q=%ZZ",
            "https:///maps?q=10,20", "https://google.com:abc/maps?q=10,20"
    })
    void refuse_un_lien_ambigu_invalide_ou_sans_point_explicite(String lien) {
        assertThatThrownBy(() -> service.appliquer(chantier(), lien, null, null, false))
                .isInstanceOf(ChantierLocalisationException.class);
    }

    @Test
    void accepte_les_coordonnees_seules_y_compris_zero_et_les_bornes() {
        Chantier chantier = chantier();
        service.appliquer(chantier, null, BigDecimal.ZERO, BigDecimal.valueOf(-180), true);
        assertThat(chantier.getLocalisation()).contains("query=0,-180");
        service.appliquer(chantier, null, BigDecimal.valueOf(90), BigDecimal.valueOf(180), false);
        assertThat(chantier.getLocalisation()).contains("query=90,180");
        assertThat(chantier.isAfficherSurCarte()).isFalse();
    }

    @Test
    void refuse_une_paire_incomplete_ou_differente_du_lien() {
        assertThatThrownBy(() -> service.appliquer(chantier(), null, BigDecimal.ONE, null, false))
                .hasMessageContaining("ensemble");
        assertThatThrownBy(() -> service.appliquer(chantier(), "google.com/maps?q=10,20", BigDecimal.ONE, BigDecimal.TEN, true))
                .hasMessageContaining("ne correspondent pas");
    }

    @Test
    void un_chantier_non_qualifie_reste_hors_carte_et_peut_rester_sans_position() {
        Chantier chantier = new Chantier();
        service.appliquer(chantier, " ", null, null, false);
        assertThat(chantier.getLocalisation()).isNull();
        assertThatThrownBy(() -> service.appliquer(chantier, null, BigDecimal.ZERO, BigDecimal.ZERO, true))
                .hasMessageContaining("nature");
        assertThatThrownBy(() -> service.appliquer(chantier(), null, null, null, true))
                .hasMessageContaining("localisation");
    }
}
