package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La migration V31 supprime les fonctions et clôture les chantiers qu'aucun bulletin de paie ne cite. Comme pour V30, le test
 * rejoue son script sur des cas préparés, dans une transaction annulée à la fin.
 */
class AuditMigrationReferentielsSansPaieTest extends AuditIntegrationTestBase {

    private static final String MIGRATION = "V31__fonctions_et_chantiers_sans_paie";

    @Test
    void le_nettoyage_supprime_les_fonctions_et_cloture_les_chantiers_sans_bulletin() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String script = new ClassPathResource("db/migration/" + MIGRATION + ".sql").getContentAsString(StandardCharsets.UTF_8);

        transaction.executeWithoutResult(statut -> {
            statut.setRollbackOnly();
            long employe = jdbc.queryForObject("""
                    INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut)
                    VALUES (?, ?, DATE '1990-01-01', DATE '2020-01-01', ?, ?, 'ACTIF') RETURNING id""", Long.class,
                    "PAYE " + ref.suffixe(), "PAYE" + ref.suffixe(), ref.fonctionId(), ref.chantierId());
            jdbc.update("""
                    INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, nombre_jours_travailles, salaire_mensuel,
                                      salaire_total)
                    VALUES (?, 999801, ?, ?, 26, 5000, 5000)""", employe, ref.fonctionId(), ref.chantierId());
            long fonctionSansPaie = fonction("SANS PAIE " + ref.suffixe());
            long fonctionDUneFiche = fonction("FICHE " + ref.suffixe());
            jdbc.update("""
                    INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut)
                    VALUES (?, ?, DATE '1990-01-01', DATE '2020-01-01', ?, NULL, 'INACTIF')""",
                    "FICHE " + ref.suffixe(), "FICHE" + ref.suffixe(), fonctionDUneFiche);
            long chantierSansPaie = jdbc.queryForObject("""
                    INSERT INTO chantier (code, designation, source_erp, actif) VALUES (?, 'Sans paie', true, true) RETURNING id""",
                    Long.class, "SP" + ref.suffixe());

            jdbc.execute(script);

            assertThat(jdbc.queryForObject("SELECT count(*) FROM fonction WHERE id = ?", Long.class, fonctionSansPaie)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM fonction WHERE id = ?", Long.class, fonctionDUneFiche))
                    .as("encore portée par une fiche : gardée").isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM fonction WHERE id = ?", Long.class, ref.fonctionId())).isEqualTo(1);
            assertThat(actif(chantierSansPaie)).isFalse();
            assertThat(actif(ref.chantierId())).isTrue();

            Map<String, Object> suppression = jdbc.queryForMap("""
                    SELECT * FROM audit_journal WHERE action = 'FONCTION_SUPPRESSION' AND perimetre ->> 'migration' = ?
                    ORDER BY id DESC LIMIT 1""", MIGRATION);
            long revision = revisionDe(suppression);
            assertThat(suppression.get("origine")).isEqualTo("MIGRATION");
            assertThat(jdbc.queryForObject("SELECT revtype FROM fonction_aud WHERE id = ? AND rev = ?", Integer.class,
                    fonctionSansPaie, revision)).as("l'instantané de la fonction supprimée").isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT actif FROM chantier_aud WHERE id = ? AND rev = ? AND revtype = 1", Boolean.class,
                    chantierSansPaie, revision)).isFalse();
            assertThat(jdbc.queryForList("SELECT action FROM audit_journal WHERE revision_id = ? ORDER BY action", String.class, revision))
                    .containsExactly("CHANTIER_MODIFICATION", "FONCTION_SUPPRESSION");
            assertThat(jdbc.queryForList("SELECT entite FROM audit_revision_entite WHERE revision_id = ? ORDER BY entite", String.class, revision))
                    .containsExactly("staport.rh.chantier.entities.Chantier", "staport.rh.function.entities.Function");
            assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class)).isTrue();
        });
    }

    private long fonction(String libelle) {
        return jdbc.queryForObject("INSERT INTO fonction (libelle) VALUES (?) RETURNING id", Long.class, libelle);
    }

    private boolean actif(long chantierId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT actif FROM chantier WHERE id = ?", Boolean.class, chantierId));
    }
}
