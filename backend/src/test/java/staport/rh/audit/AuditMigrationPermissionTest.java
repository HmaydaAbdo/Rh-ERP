package staport.rh.audit;

import org.junit.jupiter.api.Test;
import staport.rh.audit.support.AuditIntegrationTestBase;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La migration V15 (permission PAIE_PURGE) est la première migration de données postérieure à l'état initial de l'audit :
 * elle applique le gabarit de conventions/database.md. Ce test lit ce qu'elle a laissé dans la base de test.
 */
class AuditMigrationPermissionTest extends AuditIntegrationTestBase {

    private static final String MIGRATION = "V15__permission_paie_purge";

    @Test
    void la_permission_est_attribuee_aux_roles_de_depart_qui_supprimaient_deja() {
        List<String> roles = jdbc.queryForList("""
                SELECT r.nom FROM role r
                JOIN role_permission rp ON rp.role_id = r.id
                JOIN permission p ON p.id = rp.permission_id
                WHERE p.code = 'PAIE_PURGE' AND r.nom IN ('SYSTEM_ADMIN', 'PAIE_MANAGER') ORDER BY r.nom""", String.class);

        assertThat(roles).containsExactly("PAIE_MANAGER", "SYSTEM_ADMIN");
    }

    @Test
    void la_migration_ecrit_sa_revision_ses_lignes_d_audit_et_son_entree_de_journal() {
        Map<String, Object> entree = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE action = 'PERMISSION_CREATION' AND perimetre ->> 'migration' = ?", MIGRATION);
        long revision = revisionDe(entree);

        assertThat(entree.get("origine")).isEqualTo("MIGRATION");
        assertThat(entree.get("categorie")).isEqualTo("OPERATION");
        assertThat(jdbc.queryForObject("SELECT origine FROM audit_revision WHERE id = ?", String.class, revision)).isEqualTo("MIGRATION");
        assertThat(lignesAud("permission_aud", revision, (short) 0)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT code FROM permission_aud WHERE rev = ?", String.class, revision)).isEqualTo("PAIE_PURGE");
        long attributions = lignesAud("role_permission_aud", revision, (short) 0);
        assertThat(attributions).isGreaterThanOrEqualTo(2);
        assertThat(lignesAud("role_aud", revision, (short) 1)).as("le rôle propriétaire de la liaison est versionné aussi").isEqualTo(attributions);
        assertThat(((Number) entree.get("nombre_elements")).longValue()).isEqualTo(1 + attributions);
        assertThat(jdbc.queryForList("SELECT entite FROM audit_revision_entite WHERE revision_id = ? ORDER BY entite", String.class, revision))
                .containsExactly("staport.rh.auth.entities.Permission", "staport.rh.auth.entities.Role");
    }
}
