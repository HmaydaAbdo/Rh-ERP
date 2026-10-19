package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La migration V30 reprend les employés à partir de la paie (docs/adr/0010-employe-etat-du-dernier-mois-de-paie.md). Dans la
 * base de test elle n'avait rien à reprendre (aucune paie) : le test rejoue son script sur des cas préparés, dans une
 * transaction annulée à la fin — la base partagée n'en garde aucune trace. Les mois 9998-01 et 9998-02 sont les plus récents
 * de la base : 9998-02 est le « dernier mois importé ».
 */
class AuditMigrationRepriseEmployesTest extends AuditIntegrationTestBase {

    private static final String MIGRATION = "V30__employe_reprise_depuis_la_paie";
    private static final int JANVIER = 999801;
    private static final int FEVRIER = 999802;

    @Test
    void la_reprise_aligne_les_fiches_sur_la_paie_enregistre_les_departs_et_supprime_les_employes_sans_paie() throws IOException {
        Referentiel ref = donnees.creerReferentiel();
        String script = new ClassPathResource("db/migration/" + MIGRATION + ".sql").getContentAsString(StandardCharsets.UTF_8);

        transaction.executeWithoutResult(statut -> {
            statut.setRollbackOnly();
            long present = employe(ref, "PRESENT");
            bulletin(ref, present, JANVIER, "4000", null, null);
            bulletin(ref, present, FEVRIER, "5000", ref.equipeId(), null);
            long absent = employe(ref, "ABSENT");
            bulletin(ref, absent, JANVIER, "5000", null, null);
            long stc = employe(ref, "STC");
            bulletin(ref, stc, FEVRIER, "6000", null, " stc ");
            long journalier = employe(ref, "JOUR");
            bulletin(ref, journalier, JANVIER, "120", null, null);
            bulletin(ref, journalier, FEVRIER, "0", null, "VERSEMENT");
            long sansPaie = employe(ref, "SANS");
            long sansPaieAvecCompte = employe(ref, "COMPTE");
            jdbc.update("INSERT INTO utilisateur (username, email, mot_de_passe_hash, employee_id) VALUES (?, ?, 'x', ?)",
                    "u" + ref.suffixe(), "u" + ref.suffixe() + "@test.local", sansPaieAvecCompte);

            jdbc.execute(script);

            assertThat(fiche(present)).containsEntry("statut", "ACTIF").containsEntry("type_salaire", "MENSUEL")
                    .containsEntry("salaire", new BigDecimal("5000.00")).containsEntry("equipe_id", ref.equipeId());
            assertThat(fiche(absent)).containsEntry("statut", "INACTIF");
            assertThat(fiche(stc)).containsEntry("statut", "INACTIF");
            assertThat(fiche(journalier)).as("dernier bulletin non nul : le tarif d'une journée")
                    .containsEntry("statut", "ACTIF").containsEntry("type_salaire", "JOURNALIER")
                    .containsEntry("salaire", new BigDecimal("120.00"));
            assertThat(fiche(sansPaieAvecCompte)).as("lié à un compte : conservé, mais INACTIF").containsEntry("statut", "INACTIF");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM employe WHERE id = ?", Long.class, sansPaie)).isZero();

            assertThat(departs(absent)).containsExactly(FEVRIER + ":Absent de la paie (reprise)");
            assertThat(departs(stc)).containsExactly(FEVRIER + ":STC");
            assertThat(departs(sansPaieAvecCompte)).containsExactly(FEVRIER + ":Aucune paie (reprise)");
            assertThat(departs(present)).isEmpty();
            assertThat(departs(journalier)).isEmpty();

            Map<String, Object> suppression = jdbc.queryForMap("""
                    SELECT * FROM audit_journal WHERE action = 'EMPLOYE_SUPPRESSION' AND perimetre ->> 'migration' = ?
                    ORDER BY id DESC LIMIT 1""", MIGRATION);
            long revision = revisionDe(suppression);
            assertThat(suppression.get("origine")).isEqualTo("MIGRATION");
            assertThat(jdbc.queryForObject("SELECT revtype FROM employe_aud WHERE id = ? AND rev = ?", Integer.class, sansPaie, revision))
                    .as("l'instantané de l'employé supprimé").isEqualTo(2);
            assertThat(jdbc.queryForObject("SELECT type_salaire FROM employe_aud WHERE id = ? AND rev = ?", String.class, present, revision))
                    .isEqualTo("MENSUEL");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM employe_sortie_aud WHERE employee_id = ? AND rev = ?", Long.class,
                    stc, revision)).isEqualTo(1);
            assertThat(jdbc.queryForList("SELECT action FROM audit_journal WHERE revision_id = ? ORDER BY action", String.class, revision))
                    .containsExactly("EMPLOYE_MODIFICATION", "EMPLOYE_SORTIE", "EMPLOYE_SUPPRESSION");
            assertThat(jdbc.queryForList("SELECT entite FROM audit_revision_entite WHERE revision_id = ? ORDER BY entite", String.class, revision))
                    .containsExactly("staport.rh.employee.entities.Employee", "staport.rh.employee.entities.EmployeeSortie");
            assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class)).isTrue();
        });
    }

    private long employe(Referentiel ref, String nom) {
        return jdbc.queryForObject("""
                INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut)
                VALUES (?, ?, DATE '1990-01-01', DATE '2020-01-01', ?, ?, 'ACTIF') RETURNING id""", Long.class,
                nom + " " + ref.suffixe(), nom + ref.suffixe(), ref.fonctionId(), ref.chantierId());
    }

    private void bulletin(Referentiel ref, long employeId, int periode, String salaire, Long equipeId, String observation) {
        jdbc.update("""
                INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, nombre_jours_travailles, salaire_mensuel,
                                  salaire_total, observation)
                VALUES (?, ?, ?, ?, ?, 26, ?, ?, ?)""",
                employeId, periode, ref.fonctionId(), ref.chantierId(), equipeId, new BigDecimal(salaire), new BigDecimal(salaire), observation);
    }

    private Map<String, Object> fiche(long employeId) {
        return jdbc.queryForMap("SELECT statut, salaire, type_salaire, equipe_id FROM employe WHERE id = ?", employeId);
    }

    private List<String> departs(long employeId) {
        return jdbc.queryForList("SELECT periode || ':' || motif FROM employe_sortie WHERE employee_id = ? ORDER BY periode", String.class,
                employeId);
    }
}
