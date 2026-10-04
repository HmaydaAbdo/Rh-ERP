package staport.rh.common.recherche;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MotifRechercheTest {

    @Test
    void contient_met_en_minuscules_et_entoure_de_jokers() {
        assertThat(MotifRecherche.contient("Dupont")).isEqualTo("%dupont%");
    }

    @Test
    void contient_echappe_les_jokers_et_le_caractere_d_echappement() {
        assertThat(MotifRecherche.contient("100%")).isEqualTo("%100\\%%");
        assertThat(MotifRecherche.contient("a_b")).isEqualTo("%a\\_b%");
        assertThat(MotifRecherche.contient("c:\\x")).isEqualTo("%c:\\\\x%");
        assertThat(MotifRecherche.contient("%_\\")).isEqualTo("%\\%\\_\\\\%");
    }
}
