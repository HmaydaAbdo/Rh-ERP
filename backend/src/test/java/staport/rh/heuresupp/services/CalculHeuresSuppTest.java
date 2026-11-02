package staport.rh.heuresupp.services;

import org.junit.jupiter.api.Test;
import staport.rh.employee.entities.TypeSalaire;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CalculHeuresSuppTest {

    @Test
    void salaire_horaire_journalier_divise_par_dix_et_arrondi_a_l_entier() {
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("123.45"), TypeSalaire.JOURNALIER))
                .isEqualByComparingTo("12");
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("123.45"), TypeSalaire.JOURNALIER).scale()).isZero();
    }

    @Test
    void salaire_horaire_mensuel_divise_par_deux_cent_soixante_et_arrondi_a_l_entier() {
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("4000"), TypeSalaire.MENSUEL))
                .isEqualByComparingTo("15");
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("4000"), TypeSalaire.MENSUEL).scale()).isZero();
    }

    @Test
    void salaire_horaire_mensuel_frontieres_x49_x50_x51() {
        // 15,49 -> 15 ; 15,50 (exactement) -> 15 (HALF_DOWN) ; 15,51 -> 16
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("4027.40"), TypeSalaire.MENSUEL)).isEqualByComparingTo("15");
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("4030.00"), TypeSalaire.MENSUEL)).isEqualByComparingTo("15");
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("4032.60"), TypeSalaire.MENSUEL)).isEqualByComparingTo("16");
        // 16,50 exactement -> 16 (on descend), 17,50 exactement -> 17
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("4290.00"), TypeSalaire.MENSUEL)).isEqualByComparingTo("16");
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("4550.00"), TypeSalaire.MENSUEL)).isEqualByComparingTo("17");
    }

    @Test
    void salaire_horaire_journalier_frontieres_x49_x50_x51() {
        // 15,49 -> 15 ; 15,50 (exactement) -> 15 (HALF_DOWN) ; 15,51 -> 16
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("154.90"), TypeSalaire.JOURNALIER)).isEqualByComparingTo("15");
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("155.00"), TypeSalaire.JOURNALIER)).isEqualByComparingTo("15");
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("155.10"), TypeSalaire.JOURNALIER)).isEqualByComparingTo("16");
        // 16,50 exactement -> 16
        assertThat(CalculHeuresSupp.salaireHoraire(new BigDecimal("165.00"), TypeSalaire.JOURNALIER)).isEqualByComparingTo("16");
    }

    @Test
    void le_montant_part_du_salaire_horaire_arrondi() {
        BigDecimal sh = CalculHeuresSupp.salaireHoraire(new BigDecimal("4032.60"), TypeSalaire.MENSUEL); // 15,51 -> 16
        assertThat(CalculHeuresSupp.montant(sh, new BigDecimal("2.5"))).isEqualByComparingTo("40.00");
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
    void montant_absent_vaut_zero() {
        assertThat(CalculHeuresSupp.montant(null, BigDecimal.ONE)).isEqualByComparingTo("0.00");
        assertThat(CalculHeuresSupp.montant(BigDecimal.ONE, null)).isEqualByComparingTo("0.00");
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
