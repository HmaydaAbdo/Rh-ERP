package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import staport.rh.audit.support.AuditIntegrationTestBase;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AuditMigrationFusionEquipeChPlusOpTest extends AuditIntegrationTestBase {

    private static final String MIGRATION = "V34__fusion_equipe_ch_plus_op";

    @Test
    void repartit_fiches_et_bulletins_selon_la_fonction_supprime_CH_plus_OP_et_audite() throws IOException {
        String suffixe = suffixe();
        String scriptV33 = script("V33__employe_inactif_sans_affectation");
        String scriptV34 = script(MIGRATION);
        transaction.executeWithoutResult(statut -> {
            statut.setRollbackOnly();
            long source = creerEquipeSource();
            long chantier = creerChantier(suffixe);
            long ch = idEquipe("CH");
            long op = idEquipe("OP");
            long ee = idEquipe("EE");
            Map<String, Long> references = new LinkedHashMap<>();
            long employeInactif = 0;

            for (var cas : Map.of("CH. CAMION", ch, "OP. PELLE", op, "COURSIER", ch, "CHEF DE POSTE", ee).entrySet()) {
                String libelleFonction = ("COURSIER".equals(cas.getKey()) || "CHEF DE POSTE".equals(cas.getKey()))
                        ? cas.getKey() : cas.getKey() + " " + suffixe;
                long fonction = creerFonction(libelleFonction);
                long employe = creerEmploye(cas.getKey() + " " + suffixe, fonction, chantier, source, "ACTIF");
                long paie = creerPaie(employe, fonction, chantier, source, references.size() + 202601);
                references.put(cas.getKey(), employe);
                if ("CH. CAMION".equals(cas.getKey())) {
                    employeInactif = creerEmploye("INACTIF " + suffixe, fonction, chantier, source, "INACTIF");
                    creerPaie(employeInactif, fonction, chantier, source, 202605);
                }
                assertThat(paie).isPositive();
            }

            jdbc.execute(scriptV33);
            assertThat(jdbc.queryForObject("SELECT equipe_id FROM employe WHERE id = ?", Long.class, employeInactif)).isNull();
            jdbc.execute(scriptV34);
            jdbc.execute(scriptV34); // V34 relancée : l'équipe source absente rend l'opération sans effet.

            for (var cas : Map.of("CH. CAMION", ch, "OP. PELLE", op, "COURSIER", ch, "CHEF DE POSTE", ee).entrySet()) {
                assertThat(jdbc.queryForObject("SELECT equipe_id FROM employe WHERE id = ?", Long.class, references.get(cas.getKey())))
                        .isEqualTo(cas.getValue());
                assertThat(jdbc.queryForObject("SELECT count(*) FROM paie p JOIN fonction f ON f.id = p.fonction_id " +
                        "WHERE p.employee_id = ? AND p.equipe_id = ?", Long.class, references.get(cas.getKey()), cas.getValue()))
                        .isEqualTo(1L);
            }
            assertThat(jdbc.queryForObject("SELECT count(*) FROM paie WHERE employee_id = ?", Long.class, employeInactif)).isEqualTo(1L);
            assertThat(jdbc.queryForObject("SELECT equipe_id FROM paie WHERE employee_id = ?", Long.class, employeInactif)).isEqualTo(ch);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM equipe WHERE id = ?", Long.class, source)).isZero();

            Map<String, Object> entree = jdbc.queryForMap("""
                    SELECT * FROM audit_journal WHERE action = 'EQUIPE_SUPPRESSION' AND perimetre ->> 'migration' = ?
                    ORDER BY id DESC LIMIT 1""", MIGRATION);
            long revision = revisionDe(entree);
            assertThat(entree.get("origine")).isEqualTo("MIGRATION");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM equipe_aud WHERE id = ? AND rev = ? AND revtype = 2",
                    Long.class, source, revision)).isEqualTo(1L);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM employe_aud WHERE rev = ? AND revtype = 1",
                    Long.class, revision)).isEqualTo(4L);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM paie_aud WHERE rev = ? AND revtype = 1",
                    Long.class, revision)).isEqualTo(5L);
            assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class)).isTrue();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_journal WHERE perimetre ->> 'migration' = ?",
                    Long.class, MIGRATION)).isEqualTo(3L);
        });
    }

    @Test
    void bloque_la_suppression_si_une_fonction_de_CH_plus_OP_n_est_pas_classee() throws IOException {
        String migration = script(MIGRATION);
        assertThatThrownBy(() -> transaction.executeWithoutResult(statut -> {
            creerEquipeSource();
            long fonction = creerFonction("MACON " + suffixe());
            long chantier = creerChantier(suffixe());
            long employe = creerEmploye("MACON " + suffixe(), fonction, chantier, idEquipe("CH+OP"), "ACTIF");
            creerPaie(employe, fonction, chantier, idEquipe("CH+OP"), 202610);
            jdbc.execute(migration);
        })).isInstanceOf(DataAccessException.class).hasMessageContaining("fonction(s) non classée(s)");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM equipe WHERE code = 'CH+OP'", Long.class)).isEqualTo(0L);
    }

    private String script(String nom) throws IOException {
        return new ClassPathResource("db/migration/" + nom + ".sql").getContentAsString(StandardCharsets.UTF_8);
    }

    private long creerEquipeSource() {
        return jdbc.queryForObject("INSERT INTO equipe (code, libelle) VALUES ('CH+OP', 'CHAUFFEURS + OPERATEURS') RETURNING id", Long.class);
    }

    private long idEquipe(String code) {
        return jdbc.queryForObject("SELECT id FROM equipe WHERE code = ?", Long.class, code);
    }

    private long creerFonction(String libelle) {
        return jdbc.queryForObject("INSERT INTO fonction (libelle) VALUES (?) RETURNING id", Long.class, libelle);
    }

    private long creerChantier(String suffixe) {
        return jdbc.queryForObject("INSERT INTO chantier (code, designation, actif) VALUES (?, 'Test', true) RETURNING id",
                Long.class, "C" + suffixe.replace("-", "").substring(0, 8));
    }

    private long creerEmploye(String nom, long fonction, long chantier, long equipe, String statut) {
        if ("INACTIF".equals(statut)) {
            jdbc.execute("ALTER TABLE employe DROP CONSTRAINT ck_employe_affectations_statut");
        }
        return jdbc.queryForObject("""
                INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, equipe_id, statut)
                VALUES (?, ?, DATE '1990-01-01', DATE '2020-01-01', ?, ?, ?, ?) RETURNING id""",
                Long.class, nom, "CIN" + suffixe(), fonction, chantier, equipe, statut);
    }

    private long creerPaie(long employe, long fonction, long chantier, long equipe, int periode) {
        return jdbc.queryForObject("""
                INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, nombre_jours_travailles,
                                  salaire_mensuel, salaire_total)
                VALUES (?, ?, ?, ?, ?, 26, 5000, 5000) RETURNING id""",
                Long.class, employe, periode, fonction, chantier, equipe);
    }

    private static String suffixe() {
        return staport.rh.audit.support.DonneesDeTest.suffixeUnique();
    }
}
