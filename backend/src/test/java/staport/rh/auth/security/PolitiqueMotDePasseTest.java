package staport.rh.auth.security;

import org.junit.jupiter.api.Test;
import staport.rh.auth.exceptions.MotDePasseNonConformeException;
import staport.rh.support.ParametresDeTest;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PolitiqueMotDePasseTest {

    private final PolitiqueMotDePasse politique = new PolitiqueMotDePasse(ParametresDeTest.parDefaut());

    @Test
    void un_mot_de_passe_conforme_est_accepte() {
        assertThatCode(() -> politique.exiger("abcdefghi1", "hmayda")).doesNotThrowAnyException();
        assertThatCode(() -> politique.exiger("Mot de passe 2026 !", "hmayda")).doesNotThrowAnyException();
    }

    @Test
    void trop_court_ou_egal_a_l_identifiant_est_refuse() {
        assertThatThrownBy(() -> politique.exiger("abcdefgh1", "hmayda")).as("9 caractères").isInstanceOf(MotDePasseNonConformeException.class);
        assertThatThrownBy(() -> politique.exiger("Hmayda12345", "HMAYDA12345")).as("identique à l'identifiant, casse ignorée")
                .isInstanceOf(MotDePasseNonConformeException.class);
        assertThatThrownBy(() -> politique.exiger(null, "hmayda")).isInstanceOf(MotDePasseNonConformeException.class);
    }

    @Test
    void accepte_les_mots_de_passe_sans_composition_imposee() {
        assertThatCode(() -> politique.exiger("1234567890", "hmayda")).doesNotThrowAnyException();
        assertThatCode(() -> politique.exiger("!!!!!!!!!!", "hmayda")).doesNotThrowAnyException();
    }

    @Test
    void le_message_rappelle_la_regle_sans_jamais_contenir_la_valeur_saisie() {
        assertThatThrownBy(() -> politique.exiger("secret1", "hmayda"))
                .hasMessageContaining("10 caractères minimum").hasMessageNotContaining("secret1");
    }
}
