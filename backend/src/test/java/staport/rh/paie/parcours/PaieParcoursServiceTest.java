package staport.rh.paie.parcours;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.dtos.response.EmployeeSortieDto;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.equipe.entities.Equipe;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.parcours.ParcoursEmployeDto.EvenementDto;
import staport.rh.paie.parcours.ParcoursEmployeDto.TypeEvenement;
import staport.rh.paie.repositories.PaieRepository;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaieParcoursServiceTest {

    @Mock
    private PaieRepository repository;
    @Mock
    private IEmployeeService employeeService;
    @InjectMocks
    private PaieParcoursService service;

    @Test
    void raconte_l_entree_les_changements_le_depart_et_le_retour_du_plus_recent_au_plus_ancien() {
        when(employeeService.existsById(7L)).thenReturn(true);
        when(repository.findByEmployee_IdOrderByPeriodeAsc(7L)).thenReturn(List.of(
                bulletin(1L, "2026-05", "C059", "OPERATEUR", "OP", "4000", "4000", null),
                bulletin(2L, "2026-06", "C168", "OPERATEUR", "OP", "4000", "4000", null),
                bulletin(3L, "2026-07", "C168", "CHAUFFEUR", null, "4500", "4500", "STC"),
                bulletin(4L, "2026-09", "C168", "CHAUFFEUR", null, "4500", "4200", null)));
        when(employeeService.listerSorties(7L)).thenReturn(List.of(new EmployeeSortieDto(YearMonth.of(2026, 7), "STC")));

        ParcoursEmployeDto parcours = service.parcours(7L);

        assertThat(parcours.evenements()).containsExactly(
                new EvenementDto(YearMonth.of(2026, 9), TypeEvenement.RETOUR, null, null, null),
                new EvenementDto(YearMonth.of(2026, 7), TypeEvenement.DEPART, null, null, "STC"),
                new EvenementDto(YearMonth.of(2026, 7), TypeEvenement.CHANGEMENT_SALAIRE, "4000", "4500", null),
                new EvenementDto(YearMonth.of(2026, 7), TypeEvenement.CHANGEMENT_EQUIPE, "OP", null, null),
                new EvenementDto(YearMonth.of(2026, 7), TypeEvenement.CHANGEMENT_FONCTION, "OPERATEUR", "CHAUFFEUR", null),
                new EvenementDto(YearMonth.of(2026, 6), TypeEvenement.CHANGEMENT_CHANTIER, "C059", "C168", null),
                new EvenementDto(YearMonth.of(2026, 5), TypeEvenement.ENTREE, null, "C059 · OPERATEUR", null));
        assertThat(parcours.mois()).extracting(ParcoursEmployeDto.MoisDto::bulletinId).containsExactly(4L, 3L, 2L, 1L);
        assertThat(parcours.indicateurs().moisPayes()).isEqualTo(4);
        assertThat(parcours.indicateurs().totalPercu()).isEqualByComparingTo("16700");
        assertThat(parcours.indicateurs().joursTravailles()).isEqualByComparingTo("104");
        assertThat(parcours.indicateurs().premierMois()).isEqualTo(YearMonth.of(2026, 5));
        assertThat(parcours.indicateurs().dernierMois()).isEqualTo(YearMonth.of(2026, 9));
    }

    @Test
    void un_employe_sans_paie_a_un_parcours_vide() {
        when(employeeService.existsById(7L)).thenReturn(true);
        when(repository.findByEmployee_IdOrderByPeriodeAsc(7L)).thenReturn(List.of());
        when(employeeService.listerSorties(7L)).thenReturn(List.of());

        ParcoursEmployeDto parcours = service.parcours(7L);

        assertThat(parcours.evenements()).isEmpty();
        assertThat(parcours.indicateurs().moisPayes()).isZero();
        assertThat(parcours.indicateurs().premierMois()).isNull();
    }

    @Test
    void un_employe_inconnu_n_a_pas_de_parcours() {
        when(employeeService.existsById(99L)).thenReturn(false);

        assertThatThrownBy(() -> service.parcours(99L)).isInstanceOf(ParcoursEmployeIntrouvableException.class);
    }

    private static Paie bulletin(long id, String periode, String chantier, String fonction, String equipe, String salaire,
                                 String total, String observation) {
        Paie paie = new Paie();
        ReflectionTestUtils.setField(paie, "id", id);
        paie.setPeriode(YearMonth.parse(periode));
        Chantier c = new Chantier();
        c.setCode(chantier);
        paie.setChantier(c);
        Function f = new Function();
        f.setLibelle(fonction);
        paie.setFonction(f);
        if (equipe != null) {
            Equipe e = new Equipe();
            e.setCode(equipe);
            paie.setEquipe(e);
        }
        paie.setNombreJoursTravailles(new BigDecimal("26"));
        paie.setSalaireMensuel(new BigDecimal(salaire));
        paie.setSalaireTotal(new BigDecimal(total));
        paie.setObservation(observation);
        return paie;
    }
}
