package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AuditMigrationEmployesInactifsSansAffectationTest extends AuditIntegrationTestBase {

    private static final String MIGRATION = "V33__employe_inactif_sans_affectation";

    @Test
    void retire_les_affectations_des_fiches_inactives_audite_le_changement_et_preserve_les_bulletins() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String script = new ClassPathResource("db/migration/" + MIGRATION + ".sql").getContentAsString(StandardCharsets.UTF_8);

        transaction.executeWithoutResult(statut -> {
            statut.setRollbackOnly();
            // Simule des fiches historiques avant V33. Le contexte Spring applique déjà toutes les migrations,
            // donc on retire temporairement la contrainte introduite par V33 avant de créer ces anciennes lignes.
            jdbc.execute("ALTER TABLE employe DROP CONSTRAINT ck_employe_affectations_statut");
            long inactif = employe(ref, "INACTIF", "INACTIF");
            long actif = employe(ref, "ACTIF", "ACTIF");
            jdbc.execute(script);
            jdbc.execute(script);

            assertThat(jdbc.queryForMap("SELECT statut, chantier_id, equipe_id FROM employe WHERE id = ?", inactif))
                    .containsEntry("statut", "INACTIF").containsEntry("chantier_id", null).containsEntry("equipe_id", null);
            assertThat(jdbc.queryForMap("SELECT statut, chantier_id, equipe_id FROM employe WHERE id = ?", actif))
                    .containsEntry("statut", "ACTIF").containsEntry("chantier_id", ref.chantierId()).containsEntry("equipe_id", ref.equipeId());
            assertThat(jdbc.queryForMap("SELECT chantier_id, equipe_id FROM paie WHERE employee_id = ?", inactif))
                    .containsEntry("chantier_id", ref.chantierId()).containsEntry("equipe_id", ref.equipeId());

            Map<String, Object> entree = jdbc.queryForMap("""
                    SELECT * FROM audit_journal WHERE action = 'EMPLOYE_MODIFICATION' AND perimetre ->> 'migration' = ?
                    ORDER BY id DESC LIMIT 1""", MIGRATION);
            long revision = revisionDe(entree);
            assertThat(entree.get("origine")).isEqualTo("MIGRATION");
            assertThat(jdbc.queryForObject("SELECT chantier_id FROM employe_aud WHERE id = ? AND rev = ? AND revtype = 1", Long.class,
                    inactif, revision)).isNull();
            assertThat(jdbc.queryForObject("SELECT equipe_id FROM employe_aud WHERE id = ? AND rev = ? AND revtype = 1", Long.class,
                    inactif, revision)).isNull();
            assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class)).isTrue();
            assertThat(jdbc.queryForObject("""
                    SELECT count(*) FROM audit_journal WHERE action = 'EMPLOYE_MODIFICATION' AND perimetre ->> 'migration' = ?""",
                    Long.class, MIGRATION)).isEqualTo(1L);
            assertThat(jdbc.queryForObject("""
                    SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_employe_affectations_statut'""",
                    String.class)).contains("INACTIF").contains("chantier_id IS NULL").contains("equipe_id IS NULL");
        });
    }

    private long employe(Referentiel ref, String nom, String statut) {
        long id = jdbc.queryForObject("""
                INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, equipe_id, statut)
                VALUES (?, ?, DATE '1990-01-01', DATE '2020-01-01', ?, ?, ?, ?) RETURNING id""", Long.class,
                nom + " " + ref.suffixe(), nom.replace(' ', '-') + ref.suffixe(), ref.fonctionId(), ref.chantierId(), ref.equipeId(), statut);
        if ("INACTIF".equals(statut)) {
            jdbc.update("""
                    INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, nombre_jours_travailles,
                                      salaire_mensuel, salaire_total)
                    VALUES (?, 999801, ?, ?, ?, 26, 5000, 5000)""", id, ref.fonctionId(), ref.chantierId(), ref.equipeId());
        }
        return id;
    }
}
