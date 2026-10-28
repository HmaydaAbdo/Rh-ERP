package staport.rh.heuresupp.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.equipe.entities.Equipe;
import staport.rh.function.entities.Function;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.paie.entities.Paie;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HeuresSuppAnalytiqueServiceTest {

    @Mock private HeuresSuppRepository repository;

    @Test
    void calcule_les_indicateurs_et_repartit_les_forfaits_seuls_par_equipe() {
        HeuresSuppAnalytiqueService service = new HeuresSuppAnalytiqueService(repository);
        HeureSupp heures = ligne(1L, 4L, 8L, 10L, new BigDecimal("2.5"), "30.00", "0.00", null, "30.00");
        HeureSupp forfait = ligne(1L, 4L, 9L, 0L, null, "0.00", "0.00", "500.00", "500.00");
        when(repository.findAll(any(Specification.class))).thenReturn(List.of(heures, forfait));

        var resultat = service.analyser(new HeuresSuppSearchCriteria(YearMonth.of(2026, 10), List.of(4L), null, null, null, null));

        assertThat(resultat.indicateurs().employes()).isEqualTo(1);
        assertThat(resultat.indicateurs().lignesHeures()).isEqualTo(1);
        assertThat(resultat.indicateurs().heures()).isEqualByComparingTo("2.5");
        assertThat(resultat.indicateurs().montantDh()).isEqualByComparingTo("30.00");
        assertThat(resultat.indicateurs().forfaitDh()).isEqualByComparingTo("500.00");
        assertThat(resultat.indicateurs().netAPayerDh()).isEqualByComparingTo("530.00");
        assertThat(resultat.parChantier()).singleElement().satisfies(groupe -> {
            assertThat(groupe.code()).isEqualTo("C4");
            assertThat(groupe.effectif()).isEqualTo(1);
        });
        assertThat(resultat.parEquipe()).hasSize(2).anySatisfy(groupe -> {
            assertThat(groupe.id()).isZero();
            assertThat(groupe.libelle()).isEqualTo("Sans équipe");
            assertThat(groupe.forfaitDh()).isEqualByComparingTo("500.00");
        });
        assertThat(resultat.definitions().netAPayerDh()).contains("Montant − STC");
    }

    @Test
    void retourne_les_periodes_deja_triees_par_le_repository() {
        HeuresSuppAnalytiqueService service = new HeuresSuppAnalytiqueService(repository);
        List<YearMonth> periodes = List.of(YearMonth.of(2026, 10));
        when(repository.findDistinctPeriodeByOrderByPeriodeDesc()).thenReturn(periodes);

        assertThat(service.periodes()).containsExactlyElementsOf(periodes);
        verify(repository).findDistinctPeriodeByOrderByPeriodeDesc();
    }

    private static HeureSupp ligne(Long employeId, Long chantierId, Long fonctionId, Long equipeId,
                                   BigDecimal heures, String montant, String stc, String forfait, String net) {
        Employee employee = new Employee(); employee.setId(employeId);
        Chantier chantier = new Chantier(); chantier.setId(chantierId); chantier.setCode("C4"); chantier.setNom("Site");
        Function fonction = new Function(); fonction.setId(fonctionId); fonction.setLibelle("Chauffeur");
        Equipe equipe = null;
        if (equipeId != 0) { equipe = new Equipe(); equipe.setId(equipeId); equipe.setCode("E" + equipeId); equipe.setLibelle("Équipe " + equipeId); }
        Paie bulletin = new Paie(); bulletin.setEquipe(equipe);
        HeureSupp ligne = new HeureSupp();
        ligne.setEmployee(employee); ligne.setChantier(chantier); ligne.setFonction(fonction); ligne.setPaie(bulletin);
        ligne.setHeures(heures); ligne.setMontant(new BigDecimal(montant)); ligne.setStcDh(new BigDecimal(stc));
        ligne.setForfait(forfait == null ? null : new BigDecimal(forfait)); ligne.setNetAPayer(new BigDecimal(net));
        return ligne;
    }
}
