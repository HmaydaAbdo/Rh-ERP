package staport.rh.paie.effectifs;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.employee.dtos.response.EmployeeSortieDto;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.paie.repositories.EffectifBulletinProjection;
import staport.rh.paie.repositories.FiltresPaie;
import staport.rh.paie.repositories.PaieRepository;

import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class PaieEffectifsServiceTest {

    @Mock
    private PaieRepository repository;
    @Mock
    private IEmployeeService employeeService;
    @InjectMocks
    private PaieEffectifsService service;

    private static final YearMonth AOUT = YearMonth.of(2026, 8);
    private static final YearMonth SEPTEMBRE = YearMonth.of(2026, 9);

    private static EffectifBulletinProjection bulletin(long employe, YearMonth periode, long chantier, Long equipe) {
        return new EffectifBulletinProjection() {
            public Long getEmployeId() { return employe; }
            public YearMonth getPeriode() { return periode; }
            public Long getChantierId() { return chantier; }
            public Long getFonctionId() { return 1L; }
            public Long getEquipeId() { return equipe; }
        };
    }

    private void donnees() {
        when(repository.listerEffectifs(any())).thenReturn(List.of(
                bulletin(1, AOUT, 10, 5L), bulletin(2, AOUT, 10, null), bulletin(3, AOUT, 10, 5L),
                bulletin(1, SEPTEMBRE, 10, 5L), bulletin(2, SEPTEMBRE, 20, null), bulletin(4, SEPTEMBRE, 10, 5L)));
        when(employeeService.listerToutesLesSorties()).thenReturn(List.of(new EmployeeSortieDto(3L, SEPTEMBRE, "Démission")));
    }

    @Test
    void compte_payes_entrees_sorties_et_mutations_de_chaque_mois() {
        donnees();

        assertThat(service.tendances(null)).containsExactly(
                new EffectifMoisDto(AOUT, 3, null, null, null, null, 0, null),
                new EffectifMoisDto(SEPTEMBRE, 3, 3L, 0L, 1L, 1L, 1, 1L));
    }

    @Test
    void retourne_un_mois_demande_avec_sa_comparaison_metier() {
        donnees();

        assertThat(service.tendances(null, SEPTEMBRE)).containsExactly(
                new EffectifMoisDto(SEPTEMBRE, 3, 3L, 0L, 1L, 1L, 1, 1L));
    }

    @Test
    void ne_compte_que_les_bulletins_du_perimetre_et_les_departs_de_qui_y_etait_paye() {
        donnees();

        when(repository.listerEffectifs(any())).thenReturn(List.of(
                bulletin(1, AOUT, 10, 5L), bulletin(2, AOUT, 10, null), bulletin(3, AOUT, 10, 5L),
                bulletin(1, SEPTEMBRE, 10, 5L), bulletin(4, SEPTEMBRE, 10, 5L)));

        List<EffectifMoisDto> chantier10 = service.tendances(new EffectifsCriteria(List.of(10L), null, null));
        assertThat(chantier10).containsExactly(
                new EffectifMoisDto(AOUT, 3, null, null, null, null, 0, null),
                // 2 a quitté le chantier 10 : il n'y est plus payé (pas une mutation dans ce périmètre) ; 4 y entre ; 3 part
                new EffectifMoisDto(SEPTEMBRE, 2, 3L, -1L, 1L, 2L, 1, 0L));

        when(repository.listerEffectifs(any())).thenReturn(List.of(bulletin(2, AOUT, 10, null), bulletin(2, SEPTEMBRE, 20, null)));
        assertThat(service.tendances(new EffectifsCriteria(null, null, List.of(0L))))
                .as("0 = sans équipe").extracting(EffectifMoisDto::effectif).containsExactly(1L, 1L);
    }

    @Test
    void transmet_nom_cin_et_rattachements_a_la_meme_recherche_que_les_agregats() {
        var filtres = org.mockito.ArgumentCaptor.forClass(FiltresPaie.class);
        when(repository.listerEffectifs(any())).thenReturn(List.of());
        when(employeeService.listerToutesLesSorties()).thenReturn(List.of());

        service.tendances(new EffectifsCriteria(List.of(10L), List.of(1L), List.of(0L), "Ali%", "AB_"));

        verify(repository).listerEffectifs(filtres.capture());
        assertThat(filtres.getValue().getMotifNom()).isEqualTo("%ali\\%%");
        assertThat(filtres.getValue().getMotifCin()).isEqualTo("%ab\\_%");
        assertThat(filtres.getValue().getChantierIds()).containsExactly(10L);
        assertThat(filtres.getValue().getFonctionIds()).containsExactly(1L);
        assertThat(filtres.getValue().isInclureSansEquipe()).isTrue();
    }
}
