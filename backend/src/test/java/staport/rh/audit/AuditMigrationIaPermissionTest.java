package staport.rh.audit;

import org.junit.jupiter.api.Test;
import staport.rh.audit.support.AuditIntegrationTestBase;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La migration V36 crée la permission IA_UTILISER (assistant IA) et ne l'attribue qu'à SYSTEM_ADMIN. Elle applique le
 * gabarit de conventions/database.md. Ce test lit ce qu'elle a laissé dans la base de test.
 */
class AuditMigrationIaPermissionTest extends AuditIntegrationTestBase {

    private static final String MIGRATION = "V36__permission_ia_utiliser";

    @Test
    void seul_l_administrateur_porte_la_permission_a_l_installation() {
        List<String> roles = jdbc.queryForList("""
                SELECT r.nom FROM role r
                JOIN role_permission rp ON rp.role_id = r.id
                JOIN permission p ON p.id = rp.permission_id
                WHERE p.code = 'IA_UTILISER' AND r.nom IN ('SYSTEM_ADMIN', 'PAIE_MANAGER', 'DIRECTION') ORDER BY r.nom""", String.class);

        assertThat(roles).containsExactly("SYSTEM_ADMIN");
    }

    @Test
    void la_migration_ecrit_sa_revision_ses_lignes_d_audit_et_son_entree_de_journal() {
        Map<String, Object> permission = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE action = 'PERMISSION_CREATION' AND perimetre ->> 'migration' = ?", MIGRATION);
        long revision = revisionDe(permission);

        assertThat(permission.get("origine")).isEqualTo("MIGRATION");
        assertThat(jdbc.queryForObject("SELECT origine FROM audit_revision WHERE id = ?", String.class, revision)).isEqualTo("MIGRATION");
        assertThat(jdbc.queryForObject("SELECT code FROM permission_aud WHERE rev = ?", String.class, revision)).isEqualTo("IA_UTILISER");
        assertThat(lignesAud("role_permission_aud", revision, (short) 0)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT nom FROM role_aud WHERE rev = ? AND revtype = 1", String.class, revision))
                .containsExactly("SYSTEM_ADMIN");
        assertThat(((Number) permission.get("nombre_elements")).longValue()).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT entite FROM audit_revision_entite WHERE revision_id = ? ORDER BY entite", String.class, revision))
                .containsExactly("staport.rh.auth.entities.Permission", "staport.rh.auth.entities.Role");
    }
}
