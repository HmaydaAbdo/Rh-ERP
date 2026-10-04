package staport.rh.audit.support;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Socle des tests d'intégration de l'audit : une vraie base PostgreSQL (instantanés, transactions et droits ne se
 * simulent pas), un utilisateur authentifié par défaut, et des lecteurs du journal. Les tests filtrent toujours par
 * identifiant — jamais par comptage global — car la base est partagée entre tests.
 */
@SpringBootTest
public abstract class AuditIntegrationTestBase {

    protected static final long UTILISATEUR_ID = 4242L;
    protected static final String UTILISATEUR_NOM = "testeur";

    @Autowired
    protected PlatformTransactionManager gestionnaireTransactions;
    @Autowired
    protected JdbcTemplate jdbc;
    @PersistenceContext
    protected EntityManager em;

    protected TransactionTemplate transaction;
    protected DonneesDeTest donnees;
    private long derniereRevisionAvantTest;

    @BeforeEach
    void preparerSocle() {
        transaction = new TransactionTemplate(gestionnaireTransactions);
        donnees = new DonneesDeTest(transaction, em);
        derniereRevisionAvantTest = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_revision", Long.class);
        AuthentificationDeTest.connecter(UTILISATEUR_ID, UTILISATEUR_NOM);
    }

    @AfterEach
    void verifierEtNettoyerSocle() {
        AuthentificationDeTest.deconnecter();
        // Aucun scénario couvert ne doit produire une écriture hors de tout contexte (conventions/audit.md).
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_revision WHERE id > ? AND origine = 'INCONNUE'",
                Long.class, derniereRevisionAvantTest))
                .as("révisions d'origine INCONNUE créées par ce test").isZero();
    }

    /** Les entrées du journal d'une action sur une cible, de la plus ancienne à la plus récente. */
    protected List<Map<String, Object>> entrees(String action, Long entiteId) {
        return jdbc.queryForList("SELECT * FROM audit_journal WHERE action = ? AND entite_id IS NOT DISTINCT FROM ? ORDER BY id",
                action, entiteId);
    }

    protected Map<String, Object> uneEntree(String action, Long entiteId) {
        List<Map<String, Object>> entrees = entrees(action, entiteId);
        assertThat(entrees).as("entrées %s pour la cible %s", action, entiteId).hasSize(1);
        return entrees.get(0);
    }

    protected long lignesAud(String tableAud, long revision) {
        return jdbc.queryForObject("SELECT count(*) FROM " + tableAud + " WHERE rev = ?", Long.class, revision);
    }

    protected long lignesAud(String tableAud, long revision, short revtype) {
        return jdbc.queryForObject("SELECT count(*) FROM " + tableAud + " WHERE rev = ? AND revtype = ?", Long.class, revision, revtype);
    }

    protected static long revisionDe(Map<String, Object> entree) {
        assertThat(entree.get("revision_id")).as("l'entrée est liée à une révision").isNotNull();
        return ((Number) entree.get("revision_id")).longValue();
    }
}
