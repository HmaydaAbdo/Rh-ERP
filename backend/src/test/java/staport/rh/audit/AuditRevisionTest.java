package staport.rh.audit;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import staport.rh.audit.context.BatchAuditContext;
import staport.rh.audit.context.Origine;
import staport.rh.audit.support.AuthentificationDeTest;
import staport.rh.audit.support.DonneesDeTest;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.paie.entities.Paie;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 1 de l'audit : chaque écriture JPA sur une entité auditée produit une révision attribuée, au bon nom et à la
 * bonne origine, sur une vraie base PostgreSQL (les instantanés Envers n'existent qu'au commit, ils ne se simulent pas).
 */
@SpringBootTest
class AuditRevisionTest {

    @Autowired
    private PlatformTransactionManager gestionnaireTransactions;
    @Autowired
    private JdbcTemplate jdbc;
    @PersistenceContext
    private EntityManager em;

    private TransactionTemplate transaction;
    private DonneesDeTest donnees;

    @BeforeEach
    void preparer() {
        transaction = new TransactionTemplate(gestionnaireTransactions);
        donnees = new DonneesDeTest(transaction, em);
    }

    @AfterEach
    void nettoyer() {
        AuthentificationDeTest.deconnecter();
    }

    private Map<String, Object> revisionDe(String tableAud, long id, short revtype) {
        return jdbc.queryForMap("""
                SELECT r.id, r.utilisateur_id, r.utilisateur_nom, r.origine, r.request_id, r.adresse_ip
                FROM %s a JOIN audit_revision r ON r.id = a.rev
                WHERE a.id = ? AND a.revtype = ?""".formatted(tableAud), id, revtype);
    }

    @Test
    void une_creation_produit_une_revision_attribuee_a_l_utilisateur_authentifie() {
        AuthentificationDeTest.connecter(42L, "alice");
        Referentiel ref = donnees.creerReferentiel();

        long paieId = donnees.creerBulletin(ref, YearMonth.of(2026, 8));

        Map<String, Object> revision = revisionDe("paie_aud", paieId, (short) 0);
        assertThat(revision.get("utilisateur_id")).isEqualTo(42L);
        assertThat(revision.get("utilisateur_nom")).isEqualTo("alice");
        assertThat(revision.get("origine")).isEqualTo("API");
        // Le convertisseur de période s'applique aussi à l'instantané.
        assertThat(jdbc.queryForObject("SELECT periode FROM paie_aud WHERE id = ? AND revtype = 0", Integer.class, paieId))
                .isEqualTo(202608);
    }

    @Test
    void une_modification_conserve_chaque_version_et_un_enregistrement_identique_n_en_cree_aucune() {
        AuthentificationDeTest.connecter(7L, "bob");
        Referentiel ref = donnees.creerReferentiel();
        long paieId = donnees.creerBulletin(ref, YearMonth.of(2026, 8));

        transaction.executeWithoutResult(s -> em.find(Paie.class, paieId).setObservation("à vérifier"));
        long avant = jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class);
        transaction.executeWithoutResult(s -> em.find(Paie.class, paieId).setObservation("à vérifier"));
        long apres = jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class);

        assertThat(jdbc.queryForList("SELECT revtype, observation FROM paie_aud WHERE id = ? ORDER BY rev", paieId))
                .extracting(ligne -> ligne.get("revtype") + ":" + ligne.get("observation"))
                .containsExactly("0:null", "1:à vérifier");
        assertThat(apres).as("un enregistrement sans aucun changement ne crée pas de révision").isEqualTo(avant);
    }

    @Test
    void une_suppression_conserve_tout_le_contenu_de_la_ligne() {
        AuthentificationDeTest.connecter(7L, "bob");
        Referentiel ref = donnees.creerReferentiel();
        long paieId = donnees.creerBulletin(ref, YearMonth.of(2026, 8));

        transaction.executeWithoutResult(s -> em.remove(em.find(Paie.class, paieId)));

        Map<String, Object> suppression = jdbc.queryForMap(
                "SELECT employee_id, periode, chantier_id, equipe_id, salaire_total FROM paie_aud WHERE id = ? AND revtype = 2", paieId);
        assertThat(suppression.get("employee_id")).isEqualTo(ref.employeId());
        assertThat(suppression.get("periode")).isEqualTo(202608);
        assertThat(suppression.get("chantier_id")).isEqualTo(ref.chantierId());
        assertThat(suppression.get("equipe_id")).isEqualTo(ref.equipeId());
        assertThat(suppression.get("salaire_total")).isNotNull();
    }

    @Test
    void une_transaction_annulee_ne_laisse_aucune_revision() {
        AuthentificationDeTest.connecter(7L, "bob");
        Referentiel ref = donnees.creerReferentiel();
        long avant = jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class);

        transaction.executeWithoutResult(s -> {
            em.persist(donnees.nouveauBulletin(ref, YearMonth.of(2026, 9)));
            em.flush();
            s.setRollbackOnly();
        });

        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class)).isEqualTo(avant);
    }

    @Test
    void un_traitement_hors_requete_est_attribue_a_son_contexte_sous_un_identifiant_d_execution() {
        RequestAttributes requete = RequestContextHolder.getRequestAttributes();
        RequestContextHolder.resetRequestAttributes();
        try (BatchAuditContext.Scope ignore = BatchAuditContext.ouvrir("Système", Origine.TACHE_PLANIFIEE)) {
            Referentiel ref = donnees.creerReferentiel();

            Map<String, Object> revision = jdbc.queryForMap("""
                    SELECT r.utilisateur_id, r.utilisateur_nom, r.origine, r.request_id
                    FROM chantier_aud a JOIN audit_revision r ON r.id = a.rev
                    WHERE a.id = ? AND a.revtype = 0""", ref.chantierId());
            assertThat(revision.get("utilisateur_id")).isNull();
            assertThat(revision.get("utilisateur_nom")).isEqualTo("Système");
            assertThat(revision.get("origine")).isEqualTo("TACHE_PLANIFIEE");
            assertThat((String) revision.get("request_id")).hasSize(36);
        } finally {
            RequestContextHolder.setRequestAttributes(requete);
        }
    }

    @Test
    void une_ecriture_hors_de_tout_contexte_est_visible_comme_inconnue() {
        RequestAttributes requete = RequestContextHolder.getRequestAttributes();
        RequestContextHolder.resetRequestAttributes();
        try {
            Referentiel ref = donnees.creerReferentiel();

            assertThat(revisionDe("fonction_aud", ref.fonctionId(), (short) 0).get("origine")).isEqualTo("INCONNUE");
        } finally {
            RequestContextHolder.setRequestAttributes(requete);
        }
    }

    @Test
    void une_requete_sans_authentification_est_attribuee_a_un_visiteur_anonyme() {
        Referentiel ref = donnees.creerReferentiel();

        Map<String, Object> revision = revisionDe("fonction_aud", ref.fonctionId(), (short) 0);

        assertThat(revision.get("utilisateur_nom")).isEqualTo("Anonyme");
        assertThat(revision.get("origine")).isEqualTo("API");
    }

    @Test
    void un_changement_de_mot_de_passe_seul_ne_cree_aucune_revision_et_le_hash_n_est_jamais_audite() {
        AuthentificationDeTest.connecter(1L, "admin");
        String s = DonneesDeTest.suffixeUnique();
        Long compteId = transaction.execute(st -> {
            Utilisateur compte = new Utilisateur();
            compte.setUsername("u-" + s);
            compte.setEmail(s + "@exemple.test");
            compte.setMotDePasseHash("hash-1");
            em.persist(compte);
            return compte.getId();
        });
        long avant = jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class);

        transaction.executeWithoutResult(st -> em.find(Utilisateur.class, compteId).setMotDePasseHash("hash-2"));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class)).isEqualTo(avant);
        List<String> colonnes = jdbc.queryForList(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'utilisateur_aud'", String.class);
        assertThat(colonnes).doesNotContain("mot_de_passe_hash");
    }

    @Test
    void les_ajouts_et_retraits_de_droits_sont_audites() {
        AuthentificationDeTest.connecter(1L, "admin");
        String s = DonneesDeTest.suffixeUnique();
        long roleId = transaction.execute(st -> {
            Role role = new Role();
            role.setNom("R-" + s);
            em.persist(role);
            return role.getId();
        });
        Long permissionId = jdbc.queryForObject("SELECT id FROM permission WHERE code = 'PAIE_READ'", Long.class);

        transaction.executeWithoutResult(st ->
                em.find(Role.class, roleId).setPermissions(Set.of(em.getReference(Permission.class, permissionId))));
        transaction.executeWithoutResult(st -> em.find(Role.class, roleId).setPermissions(Set.of()));

        assertThat(jdbc.queryForList("SELECT revtype FROM role_permission_aud WHERE role_id = ? ORDER BY rev", Integer.class, roleId))
                .as("ajout (0) puis retrait (2) de la permission")
                .containsExactly(0, 2);
    }

    @Test
    void l_etat_initial_de_l_audit_contient_les_donnees_de_depart_et_son_entree_de_journal() {
        Map<String, Object> entree = jdbc.queryForMap("""
                SELECT j.categorie, j.resultat, j.origine, j.utilisateur_nom, j.nombre_elements, j.revision_id
                FROM audit_journal j WHERE j.action = 'AUDIT_ETAT_INITIAL'""");
        assertThat(entree.get("categorie")).isEqualTo("OPERATION");
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(entree.get("origine")).isEqualTo("MIGRATION");
        assertThat(entree.get("utilisateur_nom")).isEqualTo("Système");
        assertThat(((Number) entree.get("nombre_elements")).intValue()).isPositive();

        long revisionInitiale = ((Number) entree.get("revision_id")).longValue();
        // La permission de lecture de l'audit (V12) fait partie de l'état de départ, comme son attribution.
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM permission_aud WHERE rev = ? AND revtype = 0 AND code = 'AUDIT_READ'""",
                Long.class, revisionInitiale)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM role_permission_aud a JOIN permission_aud p ON p.id = a.permission_id AND p.rev = a.rev
                JOIN role_aud r ON r.id = a.role_id AND r.rev = a.rev
                WHERE a.rev = ? AND p.code = 'AUDIT_READ' AND r.nom = 'SYSTEM_ADMIN'""", Long.class, revisionInitiale)).isEqualTo(1L);
    }

    @Test
    void le_compte_administrateur_du_demarrage_est_attribue_au_demarrage() {
        Map<String, Object> revision = jdbc.queryForMap("""
                SELECT r.utilisateur_nom, r.origine, r.request_id
                FROM utilisateur_aud a JOIN audit_revision r ON r.id = a.rev
                WHERE a.username = 'ci-admin' AND a.revtype = 0""");

        assertThat(revision.get("utilisateur_nom")).isEqualTo("Système");
        assertThat(revision.get("origine")).isEqualTo("DEMARRAGE");
        assertThat(revision.get("request_id")).isNotNull();
    }
}
