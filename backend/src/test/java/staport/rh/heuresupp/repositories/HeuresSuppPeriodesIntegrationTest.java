package staport.rh.heuresupp.repositories;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.function.entities.Function;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.specifications.HeuresSuppSpecification;
import staport.rh.paie.entities.Paie;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** La liste des mois s'exécute sur une vraie base : le dépôt moqué des tests de service ne voyait pas son échec (500). */
class HeuresSuppPeriodesIntegrationTest extends AuditIntegrationTestBase {

    @Autowired
    private HeuresSuppRepository repository;

    @Test
    void liste_les_mois_distincts_du_plus_recent_au_plus_ancien() {
        Referentiel ref = donnees.creerReferentiel();
        YearMonth recent = YearMonth.of(2098, 12);
        YearMonth ancien = YearMonth.of(2098, 11);
        for (YearMonth mois : List.of(ancien, recent)) {
            long paieId = donnees.creerBulletin(ref, mois);
            transaction.executeWithoutResult(statut -> {
                HeureSupp ligne = new HeureSupp();
                ligne.setEmployee(em.getReference(Employee.class, ref.employeId()));
                ligne.setPaie(em.getReference(Paie.class, paieId));
                ligne.setFonction(em.getReference(Function.class, ref.fonctionId()));
                ligne.setChantier(em.getReference(Chantier.class, ref.chantierId()));
                ligne.setPeriode(mois);
                ligne.setForfait(BigDecimal.TEN);
                ligne.setMontant(BigDecimal.ZERO);
                ligne.setStcDh(BigDecimal.ZERO);
                ligne.setNetAPayer(BigDecimal.TEN);
                em.persist(ligne);
            });
        }

        List<YearMonth> mois = repository.findDistinctPeriodeByOrderByPeriodeDesc();

        assertThat(mois).containsSubsequence(recent, ancien).doesNotHaveDuplicates();

        List<Long> chantier = List.of(ref.chantierId());
        assertThat(repository.findAll(HeuresSuppSpecification.rechercher(
                new HeuresSuppSearchCriteria(null, chantier, null, null, null, null, List.of(recent, ancien))))).hasSize(2);
        assertThat(repository.findAll(HeuresSuppSpecification.rechercher(
                new HeuresSuppSearchCriteria(null, chantier, null, null, null, null, List.of(recent))))).hasSize(1);
    }
}
