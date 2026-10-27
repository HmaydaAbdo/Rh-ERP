package staport.rh.heuresupp.services;

import org.junit.jupiter.api.Test;
import staport.rh.employee.entities.TypeSalaire;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CalculHeuresSuppTest {

    @Test
    void salaire_horaire_journalier_divise_par_dix_sans_arrondir() {
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("123.45"), TypeSalaire.JOURNALIER))
                .isEqualByComparingTo("12.345");
    }

    @Test
    void salaire_horaire_mensuel_divise_par_deux_cent_soixante() {
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("4000"), TypeSalaire.MENSUEL))
                .isEqualByComparingTo("15.38461538461538461538");
    }

    @Test
    void salaire_absent_est_refuse() {
        assertThatThrownBy(() -> CalculHeuresSupp.salaireHoraire(null, TypeSalaire.MENSUEL))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CalculHeuresSupp.salaireHoraire(BigDecimal.ONE, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void montant_est_arrondi_a_deux_decimales() {
        assertThat(CalculHeuresSupp.montant(new BigDecimal("12.345"), new BigDecimal("1.1")))
                .isEqualByComparingTo("13.58");
    }

    @Test
    void stc_et_net_separent_le_forfait_du_montant() {
        BigDecimal montant = new BigDecimal("150.00");
        assertThat(CalculHeuresSupp.stcDh(montant, true)).isEqualByComparingTo("150");
        assertThat(CalculHeuresSupp.stcDh(montant, false)).isEqualByComparingTo("0");
        assertThat(CalculHeuresSupp.netAPayer(montant, new BigDecimal("150.00"), new BigDecimal("500.00")))
                .isEqualByComparingTo("500.00");
    }
}
