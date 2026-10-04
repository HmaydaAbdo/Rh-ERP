package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.chantier.sync.ChantierErpDto;
import staport.rh.chantier.sync.ChantierSyncClient;
import staport.rh.chantier.sync.ChantierSyncScheduler;
import staport.rh.chantier.sync.ChantierSyncService;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Scénarios S6 et S7 : la synchronisation des chantiers crée chaque chantier dans sa propre transaction — une entrée pour
 * l'ensemble, les révisions reliées par l'identifiant d'exécution ; planifiée, elle n'a pas d'utilisateur mais une
 * origine explicite.
 */
class AuditSynchronisationTest extends AuditIntegrationTestBase {

    @MockitoBean
    private ChantierSyncClient client;
    @Autowired
    private ChantierSyncScheduler planificateur;
    @Autowired
    private ChantierSyncService synchronisation;

    private List<ChantierErpDto> deuxChantiers(String s) {
        return List.of(new ChantierErpDto(1L, "Chantier A " + s, "SA-" + s, 0), new ChantierErpDto(2L, "Chantier B " + s, "SB-" + s, 0));
    }

    @Test
    void la_synchronisation_planifiee_est_attribuee_au_systeme_et_relie_ses_revisions_par_l_identifiant_d_execution() {
        String s = Long.toHexString(System.nanoTime());
        when(client.fetchChantiers()).thenReturn(deuxChantiers(s));

        planificateur.synchroniserQuotidiennement();

        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE action = 'CHANTIER_SYNCHRONISATION' ORDER BY id DESC LIMIT 1");
        assertThat(entree.get("origine")).isEqualTo("TACHE_PLANIFIEE");
        assertThat(entree.get("utilisateur_nom")).isEqualTo("Système");
        assertThat(entree.get("utilisateur_id")).isNull();
        assertThat(((Number) entree.get("nombre_elements")).intValue()).isEqualTo(2);
        assertThat(entree.get("perimetre").toString()).contains("\"recus\": 2");
        String executionId = (String) entree.get("request_id");
        assertThat(executionId).hasSize(36);
        // Une révision par chantier créé (une transaction chacun), toutes sous le même identifiant d'exécution.
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM chantier_aud a JOIN audit_revision r ON r.id = a.rev
                WHERE a.revtype = 0 AND r.request_id = ? AND a.code IN (?, ?) AND r.origine = 'TACHE_PLANIFIEE'""",
                Long.class, executionId, "SA-" + s, "SB-" + s)).isEqualTo(2L);
    }

    @Test
    void la_synchronisation_declenchee_par_un_utilisateur_est_attribuee_a_cet_utilisateur() {
        String s = Long.toHexString(System.nanoTime());
        when(client.fetchChantiers()).thenReturn(deuxChantiers(s));

        synchronisation.synchroniser();

        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE action = 'CHANTIER_SYNCHRONISATION' ORDER BY id DESC LIMIT 1");
        assertThat(entree.get("origine")).isEqualTo("API");
        assertThat(entree.get("utilisateur_nom")).isEqualTo(UTILISATEUR_NOM);
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
    }
}
