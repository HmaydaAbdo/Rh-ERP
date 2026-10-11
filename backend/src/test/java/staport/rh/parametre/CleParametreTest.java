package staport.rh.parametre;

import org.junit.jupiter.api.Test;
import staport.rh.parametre.entities.CleParametre;
import staport.rh.parametre.exceptions.ParametreInvalideException;

import java.util.Arrays;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CleParametreTest {

    @Test
    void les_codes_sont_uniques_et_retrouvables() {
        assertThat(Arrays.stream(CleParametre.values()).map(CleParametre::code).collect(Collectors.toSet()))
                .hasSameSizeAs(CleParametre.values());
        for (CleParametre cle : CleParametre.values()) {
            assertThat(CleParametre.depuisCode(cle.code())).contains(cle);
        }
        assertThat(CleParametre.depuisCode("inconnu")).isEmpty();
    }

    @Test
    void un_entier_dans_les_bornes_est_accepte_sous_sa_forme_canonique() {
        assertThat(CleParametre.JETON_SESSION.normaliser(" 012 ")).isEqualTo("12");
        assertThat(CleParametre.JETON_SESSION.normaliser("1")).isEqualTo("1");
        assertThat(CleParametre.JETON_SESSION.normaliser("720")).isEqualTo("720");
    }

    @Test
    void un_entier_hors_bornes_ou_une_saisie_qui_n_en_est_pas_un_est_refuse() {
        assertThatThrownBy(() -> CleParametre.JETON_SESSION.normaliser("0")).isInstanceOf(ParametreInvalideException.class);
        assertThatThrownBy(() -> CleParametre.JETON_SESSION.normaliser("721")).isInstanceOf(ParametreInvalideException.class);
        assertThatThrownBy(() -> CleParametre.JETON_SESSION.normaliser("1,5")).isInstanceOf(ParametreInvalideException.class);
        assertThatThrownBy(() -> CleParametre.JETON_SESSION.normaliser(null)).isInstanceOf(ParametreInvalideException.class);
    }

    @Test
    void la_longueur_du_mot_de_passe_ne_descend_jamais_sous_huit_caracteres() {
        assertThat(CleParametre.LONGUEUR_MOT_DE_PASSE.minimum()).isEqualTo(8L);
        assertThatThrownBy(() -> CleParametre.LONGUEUR_MOT_DE_PASSE.normaliser("7")).isInstanceOf(ParametreInvalideException.class);
    }

    @Test
    void une_expression_cron_a_six_champs_est_acceptee() {
        assertThat(CleParametre.CRON_SYNCHRONISATION_CHANTIERS.normaliser(" 0 30 2 * * * ")).isEqualTo("0 30 2 * * *");
        assertThatThrownBy(() -> CleParametre.CRON_SYNCHRONISATION_CHANTIERS.normaliser("0 30 2")).isInstanceOf(ParametreInvalideException.class);
        assertThatThrownBy(() -> CleParametre.CRON_SYNCHRONISATION_CHANTIERS.normaliser("")).isInstanceOf(ParametreInvalideException.class);
    }
}
