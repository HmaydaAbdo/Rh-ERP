package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.TestPropertySource;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** La migration V35 clôture les chantiers sans bulletin sur le dernier mois de paie et journalise leur état. */
@TestPropertySource(properties = "security.cors.allowed-origins=http://localhost:4200")
class AuditMigrationChantiersAbsentsDernierePaieTest extends AuditIntegrationTestBase {

    private static final String MIGRATION = "V35__cloturer_chantiers_absents_derniere_paie";
    private static final int DERNIERE_PERIODE = 999912;
    private static final int PERIODE_PRECEDENTE = 999911;

    @Test
    void cloture_les_chantiers_absents_du_dernier_mois_y_compris_ceux_avec_un_historique() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String script = script();

        transaction.executeWithoutResult(statut -> {
            statut.setRollbackOnly();
            // Les tests d'intégration partagent leur base; isoler les données de ce scénario sans les conserver.
            jdbc.update("DELETE FROM paie");
            jdbc.update("UPDATE chantier SET actif = false WHERE actif");
            jdbc.update("UPDATE chantier SET actif = true WHERE id = ?", ref.chantierId());
            long chantierHistorique = creerChantier("HISTORIQUE " + ref.suffixe(), true);
            long chantierSansBulletin = creerChantier("SANS PAIE " + ref.suffixe(), true);
            long chantierDejaCloture = creerChantier("DEJA CLOTURE " + ref.suffixe(), false);
            insererBulletin(ref, DERNIERE_PERIODE, ref.chantierId());
            insererBulletin(ref, PERIODE_PRECEDENTE, chantierHistorique);

            jdbc.execute(script);

            assertThat(actif(ref.chantierId())).as("présent dans la dernière paie").isTrue();
            assertThat(actif(chantierHistorique)).as("présent seulement dans un mois antérieur").isFalse();
            assertThat(actif(chantierSansBulletin)).as("absent de tout bulletin").isFalse();
            assertThat(actif(chantierDejaCloture)).as("déjà clôturé").isFalse();
            assertThat(jdbc.queryForObject("SELECT version FROM chantier WHERE id = ?", Long.class, chantierHistorique)).isEqualTo(1L);
            assertThat(jdbc.queryForObject("SELECT version FROM chantier WHERE id = ?", Long.class, chantierSansBulletin)).isEqualTo(1L);

            Map<String, Object> entree = jdbc.queryForMap("""
                    SELECT * FROM audit_journal
                     WHERE action = 'CHANTIER_MODIFICATION' AND perimetre ->> 'migration' = ?
                     ORDER BY id DESC LIMIT 1
                    """, MIGRATION);
            long revision = revisionDe(entree);
            assertThat(entree.get("origine")).isEqualTo("MIGRATION");
            assertThat(((Number) entree.get("nombre_elements")).intValue()).isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT perimetre ->> 'periode' FROM audit_journal WHERE id = ?", String.class,
                    entree.get("id"))).isEqualTo(String.valueOf(DERNIERE_PERIODE));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM chantier_aud WHERE rev = ? AND revtype = 1 AND actif = false",
                    Long.class, revision)).isEqualTo(2L);
            assertThat(jdbc.queryForList("SELECT entite FROM audit_revision_entite WHERE revision_id = ?", String.class, revision))
                    .containsExactly("staport.rh.chantier.entities.Chantier");
            assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class)).isTrue();
        });
    }

    @Test
    void ne_modifie_rien_si_la_base_ne_contient_aucune_paie() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String script = script();

        transaction.executeWithoutResult(statut -> {
            statut.setRollbackOnly();
            jdbc.update("DELETE FROM paie");
            jdbc.execute(script);
            assertThat(actif(ref.chantierId())).isTrue();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_journal WHERE perimetre ->> 'migration' = ?",
                    Long.class, MIGRATION)).isZero();
        });
    }

    private String script() throws IOException {
        return new ClassPathResource("db/migration/" + MIGRATION + ".sql").getContentAsString(StandardCharsets.UTF_8);
    }

    private long creerChantier(String designation, boolean actif) {
        return jdbc.queryForObject("INSERT INTO chantier (code, designation, source_erp, actif) VALUES (?, ?, true, ?) RETURNING id",
                Long.class, "C-" + staport.rh.audit.support.DonneesDeTest.suffixeUnique(), designation, actif);
    }

    private void insererBulletin(Referentiel ref, int periode, long chantierId) {
        jdbc.update("""
                INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, nombre_jours_travailles,
                                  salaire_mensuel, salaire_total)
                VALUES (?, ?, ?, ?, 26, 5000, 5000)
                """, ref.employeId(), periode, ref.fonctionId(), chantierId);
    }

    private boolean actif(long chantierId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT actif FROM chantier WHERE id = ?", Boolean.class, chantierId));
    }
}
