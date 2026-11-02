package staport.rh.heuresupp.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.paie.events.PaieModifieeEvenement;
import staport.rh.paie.events.PaieSuppressionDemandeeEvenement;
import staport.rh.paie.exceptions.PaieLieeException;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EcouteurPaieHeuresSuppTest {

    @Mock
    private HeuresSuppRepository repository;
    @InjectMocks
    private EcouteurPaieHeuresSupp ecouteur;

    private static HeureSupp ligne(boolean stc, String forfait) {
        HeureSupp ligne = new HeureSupp();
        ligne.setMontant(new BigDecimal("30.00"));
        ligne.setStcOuSortie(stc);
        ligne.setStcDh(stc ? new BigDecimal("30.00") : BigDecimal.ZERO.setScale(2));
        ligne.setForfait(forfait == null ? null : new BigDecimal(forfait));
        ligne.setNetAPayer(CalculHeuresSupp.netAPayer(ligne.getMontant(), ligne.getStcDh(), ligne.getForfait()));
        return ligne;
    }

    @Test
    void une_paie_qui_devient_stc_passe_le_montant_en_stc_et_annule_le_forfait() {
        HeureSupp ligne = ligne(false, "100");
        when(repository.findByPaie_Id(7L)).thenReturn(List.of(ligne));

        ecouteur.paieModifiee(new PaieModifieeEvenement(7L, " STC "));

        assertThat(ligne.isStcOuSortie()).isTrue();
        assertThat(ligne.getForfait()).isNull();
        assertThat(ligne.getStcDh()).isEqualByComparingTo("30");
        assertThat(ligne.getNetAPayer()).isEqualByComparingTo("0");
        verify(repository).save(ligne);
    }

    @Test
    void une_paie_qui_n_est_plus_stc_reprend_un_net_a_payer() {
        HeureSupp ligne = ligne(true, null);
        when(repository.findByPaie_Id(7L)).thenReturn(List.of(ligne));

        ecouteur.paieModifiee(new PaieModifieeEvenement(7L, "RAS"));

        assertThat(ligne.isStcOuSortie()).isFalse();
        assertThat(ligne.getStcDh()).isEqualByComparingTo("0");
        assertThat(ligne.getNetAPayer()).isEqualByComparingTo("30");
    }

    @Test
    void une_modification_sans_effet_sur_le_marqueur_ne_touche_pas_aux_lignes() {
        HeureSupp ligne = ligne(false, "10");
        when(repository.findByPaie_Id(7L)).thenReturn(List.of(ligne));

        ecouteur.paieModifiee(new PaieModifieeEvenement(7L, null));

        verify(repository, never()).save(ligne);
        assertThat(ligne.getForfait()).isEqualByComparingTo("10");
    }

    @Test
    void la_suppression_d_un_bulletin_lie_est_refusee() {
        when(repository.countByPaie_IdIn(List.of(7L))).thenReturn(1L);
        when(repository.countByPaie_IdIn(List.of(7L, 8L))).thenReturn(3L);

        assertThatThrownBy(() -> ecouteur.suppressionDemandee(new PaieSuppressionDemandeeEvenement(List.of(7L))))
                .isInstanceOf(PaieLieeException.class).hasMessageContaining("une ligne");
        assertThatThrownBy(() -> ecouteur.suppressionDemandee(new PaieSuppressionDemandeeEvenement(List.of(7L, 8L))))
                .isInstanceOf(PaieLieeException.class).hasMessageContaining("3 lignes");
    }

    @Test
    void la_suppression_d_un_bulletin_libre_est_acceptee() {
        when(repository.countByPaie_IdIn(List.of(9L))).thenReturn(0L);

        ecouteur.suppressionDemandee(new PaieSuppressionDemandeeEvenement(List.of(9L)));
    }
}
