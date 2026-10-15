package staport.rh.audit;

import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.test.context.TestPropertySource;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.services.interfaces.IPaieService;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Scénario S26 : un compte applicatif compromis ne peut ni effacer ni réécrire l'audit. Ce contexte démarre
 * <strong>comme en production</strong> : Flyway avec le compte propriétaire, qui — par le rappel
 * {@code afterMigrate.sql} — crée le compte applicatif et lui retire tout droit de modification sur les tables d'audit ;
 * l'application, elle, se connecte avec ce compte restreint. Si l'application fonctionne ici (création, suppression en
 * groupe, connexion), c'est qu'elle n'a besoin que d'insérer dans l'audit.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "spring.datasource.username=audit_app_test",
        "spring.datasource.password=mot-de-passe-de-test-1",
        "spring.flyway.placeholders.app_user=audit_app_test",
        "spring.flyway.placeholders.app_password=mot-de-passe-de-test-1"
})
class AuditIntegriteTest extends AuditIntegrationTestBase {

    @Autowired
    private IPaieService paieService;
    @Autowired
    private MeterRegistry registre;
    @Value("${spring.flyway.user}")
    private String proprietaire;
    @Value("${spring.flyway.password}")
    private String motDePasseProprietaire;
    @Value("${DB_HOST}")
    private String hote;
    @Value("${DB_PORT}")
    private String port;
    @Value("${DB_NAME}")
    private String base;

    private Connection connexionProprietaire() throws SQLException {
        return DriverManager.getConnection("jdbc:postgresql://" + hote + ":" + port + "/" + base, proprietaire, motDePasseProprietaire);
    }

    @Test
    void l_application_fonctionne_avec_le_compte_restreint_et_le_signale_comme_conforme() {
        assertThat(jdbc.queryForObject("SELECT current_user", String.class)).isEqualTo("audit_app_test");
        assertThat(registre.get("rh.audit.integrite.compromise").gauge().value()).as("compte restreint : intégrité garantie").isZero();

        // Les opérations métier, y compris la suppression en groupe, n'ont besoin que d'insérer dans l'audit.
        YearMonth mois = YearMonth.of(2035, 1);
        Referentiel ref = donnees.creerReferentiel();
        paieService.create(new PaieCreateRequestDto(ref.employeId(), mois, ref.fonctionId(), ref.chantierId(), ref.equipeId(), new BigDecimal("26.75"),
                null, null, BigDecimal.TEN, null, null, BigDecimal.TEN, null));
        assertThat(jdbc.queryForObject("SELECT nombre_jours_travailles FROM paie WHERE employee_id = ? AND periode = ?",
                BigDecimal.class, ref.employeId(), 203501)).isEqualByComparingTo("26.75");
        long supprimes = paieService.deleteGroupe(new PaieSearchCriteria(null, null, mois, null, null, null), 1);

        assertThat(supprimes).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT resultat FROM audit_journal WHERE action = 'PAIE_CREATION' ORDER BY id DESC LIMIT 1", String.class))
                .isEqualTo("SUCCES");
    }

    @Test
    void le_compte_applicatif_ne_peut_ni_modifier_ni_supprimer_ni_vider_une_table_d_audit() {
        Long id = jdbc.queryForObject("SELECT max(id) FROM audit_journal", Long.class);
        long revision = jdbc.queryForObject("SELECT max(id) FROM audit_revision", Long.class);

        for (String sql : new String[]{
                "UPDATE audit_journal SET motif = 'effacé' WHERE id = " + id,
                "DELETE FROM audit_journal WHERE id = " + id,
                "TRUNCATE audit_journal",
                "UPDATE audit_revision SET utilisateur_nom = 'autre' WHERE id = " + revision,
                "DELETE FROM audit_revision WHERE id = " + revision,
                "UPDATE paie_aud SET salaire_total = 0",
                "DELETE FROM paie_aud",
                "DELETE FROM utilisateur_role_aud",
                "DELETE FROM audit_revision_entite",
                "DELETE FROM flyway_schema_history"}) {
            assertThatThrownBy(() -> jdbc.execute(sql))
                    .as(sql)
                    .isInstanceOf(DataAccessException.class)
                    .rootCause().hasMessageContaining("permission denied");
        }
        assertThatThrownBy(() -> jdbc.execute("ALTER TABLE audit_journal DROP COLUMN motif"))
                .as("ni modifier le schéma de l'audit")
                .rootCause().hasMessageContaining("must be owner");
        // Lire et ajouter restent permis : c'est tout ce dont l'application a besoin.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_journal", Long.class)).isPositive();
        jdbc.update("INSERT INTO audit_journal (horodatage, categorie, action, resultat, utilisateur_nom, origine) "
                + "VALUES (now(), 'SECURITE', 'CONNEXION_REUSSIE', 'SUCCES', 'test-integrite', 'API')");
    }

    @Test
    void le_compte_applicatif_garde_ses_droits_sur_les_donnees_metier() {
        Referentiel ref = donnees.creerReferentiel();

        assertThat(jdbc.update("UPDATE employe SET statut = 'INACTIF' WHERE id = ?", ref.employeId())).isEqualTo(1);
        assertThat(jdbc.update("DELETE FROM employe WHERE id = ?", ref.employeId())).isEqualTo(1);
    }

    @Test
    void le_proprietaire_conserve_tous_les_droits_pour_les_migrations_et_la_maintenance() throws SQLException {
        try (Connection connexion = connexionProprietaire(); Statement ordre = connexion.createStatement()) {
            ordre.execute("UPDATE audit_journal SET motif = motif WHERE false");
            ordre.execute("DELETE FROM audit_journal WHERE false");
        }
    }

    @Test
    void la_chaine_est_valide_apres_ajout_et_detecte_une_modification_directe() throws SQLException {
        jdbc.update("INSERT INTO audit_journal (horodatage, categorie, action, resultat, utilisateur_nom, origine) "
                + "VALUES (now(), 'SECURITE', 'TEST_CHAINE_INTEGRITE', 'SUCCES', 'test-integrite', 'API')");
        Long id = jdbc.queryForObject("SELECT max(id) FROM audit_journal WHERE action = 'TEST_CHAINE_INTEGRITE'", Long.class);
        assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("SELECT hash_entree FROM audit_journal WHERE id = ?", String.class, id))
                .hasSize(64);

        try (Connection connexion = connexionProprietaire()) {
            connexion.setAutoCommit(false);
            try (Statement ordre = connexion.createStatement()) {
                ordre.execute("UPDATE audit_journal SET motif = 'modification de test' WHERE id = " + id);
                try (ResultSet resultat = ordre.executeQuery("SELECT audit_journal_chaine_valide()")) {
                    assertThat(resultat.next()).isTrue();
                    assertThat(resultat.getBoolean(1)).as("la chaîne signale une altération directe").isFalse();
                }
            } finally {
                connexion.rollback();
            }
        }

        assertThat(jdbc.queryForObject("SELECT audit_journal_chaine_valide()", Boolean.class))
                .as("l'annulation de l'altération restaure la validité de la chaîne").isTrue();
    }
}
