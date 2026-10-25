package staport.rh.employee.services;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto.TrancheDto;
import staport.rh.employee.dtos.response.EmployeeRegroupementDto;
import staport.rh.employee.entities.DimensionEmployes;
import staport.rh.employee.services.interfaces.IEmployeeAnalytiqueService;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regroupements et analyse sur une vraie base (requêtes Criteria, jointure externe de l'équipe). Chaque test s'isole par le
 * chantier de son référentiel : la base est partagée entre tests.
 */
class EmployeeAnalytiqueServiceTest extends AuditIntegrationTestBase {

    @Autowired
    private IEmployeeAnalytiqueService service;

    /** Le référentiel compte déjà un employé ACTIF, sans équipe, né le 01/01/1990 et embauché le 01/01/2020. */
    private Referentiel referentielAvecTroisEmployes() {
        Referentiel ref = donnees.creerReferentiel();
        jdbc.update("UPDATE employe SET equipe_id = NULL WHERE id = ?", ref.employeId());
        LocalDate aujourdhui = LocalDate.now();
        employe(ref, "A", aujourdhui.minusYears(22), aujourdhui.minusMonths(3), ref.equipeId(), "ACTIF");
        employe(ref, "B", aujourdhui.minusYears(58), aujourdhui.minusYears(12), null, "INACTIF");
        return ref;
    }

    private void employe(Referentiel ref, String nom, LocalDate naissance, LocalDate embauche, Long equipeId, String statut) {
        jdbc.update("""
                INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, equipe_id, statut)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""", nom + " " + ref.suffixe(), nom + ref.suffixe(), Date.valueOf(naissance),
                Date.valueOf(embauche), ref.fonctionId(), "INACTIF".equals(statut) ? null : ref.chantierId(), equipeId, statut);
    }

    private static EmployeeSearchCriteria duChantier(Referentiel ref, List<Long> equipeIds) {
        // Le périmètre inclut aussi « Sans chantier » : un employé INACTIF n'a plus d'affectation courante.
        // Le filtre par fonction isole aussi ce test des « Sans chantier » créés par les autres tests d'intégration.
        return new EmployeeSearchCriteria(null, null, List.of(ref.fonctionId()), List.of(ref.chantierId(), 0L), equipeIds, null);
    }

    @Test
    void regroupe_par_equipe_avec_un_groupe_sans_equipe_et_compte_les_actifs() {
        Referentiel ref = referentielAvecTroisEmployes();

        List<EmployeeRegroupementDto> groupes = service.regrouper(duChantier(ref, null), DimensionEmployes.EQUIPE);

        assertThat(groupes).containsExactly(
                new EmployeeRegroupementDto(0L, null, "Sans équipe", 2, 1),
                new EmployeeRegroupementDto(ref.equipeId(), "E" + ref.suffixe(), "Equipe " + ref.suffixe(), 1, 1));
    }

    @Test
    void regroupe_par_chantier_et_par_fonction() {
        Referentiel ref = referentielAvecTroisEmployes();

        assertThat(service.regrouper(duChantier(ref, null), DimensionEmployes.CHANTIER))
                .extracting(EmployeeRegroupementDto::id, EmployeeRegroupementDto::effectif)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(ref.chantierId(), 2L),
                        org.assertj.core.groups.Tuple.tuple(0L, 1L));
        assertThat(service.regrouper(duChantier(ref, null), DimensionEmployes.FONCTION))
                .extracting(EmployeeRegroupementDto::code, EmployeeRegroupementDto::effectif)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("F-" + ref.suffixe(), 3L));
    }

    @Test
    void le_filtre_equipe_zero_garde_les_employes_sans_equipe() {
        Referentiel ref = referentielAvecTroisEmployes();

        assertThat(service.regrouper(duChantier(ref, List.of(0L)), DimensionEmployes.EQUIPE))
                .extracting(EmployeeRegroupementDto::id).containsExactly(0L);
        assertThat(service.regrouper(duChantier(ref, List.of(0L, ref.equipeId())), DimensionEmployes.EQUIPE)).hasSize(2);
    }

    @Test
    void analyse_les_effectifs_les_ages_et_les_anciennetes_par_tranche() {
        Referentiel ref = referentielAvecTroisEmployes();

        EmployeeAnalytiqueDto analyse = service.analyser(duChantier(ref, null));

        assertThat(analyse.effectif()).isEqualTo(3);
        assertThat(analyse.actifs()).isEqualTo(2);
        assertThat(analyse.inactifs()).isEqualTo(1);
        assertThat(analyse.embauchesDouzeMois()).isEqualTo(1);
        assertThat(analyse.parAge()).extracting(TrancheDto::effectif).containsExactly(1L, 0L, 1L, 0L, 1L);
        assertThat(analyse.parAge().get(4)).isEqualTo(new TrancheDto(55, null, 1));
        assertThat(analyse.parAnciennete()).extracting(TrancheDto::effectif).containsExactly(1L, 0L, 0L, 1L, 1L);
        assertThat(analyse.ageMoyen()).isNotNull();
    }

    @Test
    void un_perimetre_vide_n_a_ni_age_ni_anciennete_moyens() {
        EmployeeAnalytiqueDto analyse = service.analyser(new EmployeeSearchCriteria("personne-" + System.nanoTime(), null, null, null, null, null));

        assertThat(analyse.effectif()).isZero();
        assertThat(analyse.ageMoyen()).isNull();
        assertThat(analyse.parAge()).extracting(TrancheDto::effectif).containsOnly(0L);
    }

    @Test
    void les_embauches_sur_douze_mois_excluent_les_dates_futures_et_la_borne_ancienne() {
        Referentiel ref = donnees.creerReferentiel();
        LocalDate aujourdhui = LocalDate.now();
        employe(ref, "AUJOURDHUI", aujourdhui.minusYears(30), aujourdhui, null, "ACTIF");
        employe(ref, "DEMAIN", aujourdhui.minusYears(30), aujourdhui.plusDays(1), null, "ACTIF");
        employe(ref, "BORNE", aujourdhui.minusYears(30), aujourdhui.minusYears(1), null, "ACTIF");

        EmployeeAnalytiqueDto analyse = service.analyser(duChantier(ref, null));

        assertThat(analyse.effectif()).isEqualTo(4);
        assertThat(analyse.embauchesDouzeMois()).isEqualTo(1);
    }
}
