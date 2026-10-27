package staport.rh.heuresupp.imports;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HeuresSuppImportCorrectionsDtoTest {

    @Test
    void listes_absentes_sont_normalisees_en_listes_vides() {
        HeuresSuppImportCorrectionsDto corrections = new HeuresSuppImportCorrectionsDto(null, null);

        assertThat(corrections.aligner()).isEmpty();
        assertThat(corrections.creer()).isEmpty();
    }
}
