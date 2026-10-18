package staport.rh.audit;

import org.junit.jupiter.api.Test;
import staport.rh.audit.support.AuditIntegrationTestBase;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La migration V28 crée la permission CARTE_READ et le rôle DIRECTION (carte des chantiers). Elle applique le gabarit de
 * conventions/database.md. Ce test lit ce qu'elle a laissé dans la base de test.
 */
class AuditMigrationCartePermissionTest extends AuditIntegrationTestBase {

    private static final String MIGRATION = "V28__carte_chantiers_permission_et_role";

    @Test
    void la_permission_est_portee_par_l_administrateur_et_par_la_direction_mais_pas_par_la_paie() {
        List<String> roles = jdbc.queryForList("""
                SELECT r.nom FROM role r
                JOIN role_permission rp ON rp.role_id = r.id
                JOIN permission p ON p.id = rp.permission_id
                WHERE p.code = 'CARTE_READ' AND r.nom IN ('SYSTEM_ADMIN', 'PAIE_MANAGER', 'DIRECTION') ORDER BY r.nom""", String.class);

        assertThat(roles).containsExactly("DIRECTION", "SYSTEM_ADMIN");
    }

    @Test
    void la_direction_ne_porte_que_la_consultation_de_la_carte_a_l_installation() {
        List<String> permissions = jdbc.queryForList("""
                SELECT p.code FROM permission p
                JOIN role_permission rp ON rp.permission_id = p.id
                JOIN role r ON r.id = rp.role_id
                WHERE r.nom = 'DIRECTION' ORDER BY p.code""", String.class);

        assertThat(permissions).containsExactly("CARTE_READ");
    }

    @Test
    void la_migration_ecrit_sa_revision_ses_lignes_d_audit_et_ses_entrees_de_journal() {
        Map<String, Object> permission = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE action = 'PERMISSION_CREATION' AND perimetre ->> 'migration' = ?", MIGRATION);
        Map<String, Object> role = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE action = 'ROLE_CREATION' AND perimetre ->> 'migration' = ?", MIGRATION);
        long revision = revisionDe(permission);

        assertThat(revisionDe(role)).as("une seule révision pour toute la migration").isEqualTo(revision);
        assertThat(permission.get("origine")).isEqualTo("MIGRATION");
        assertThat(permission.get("categorie")).isEqualTo("OPERATION");
        assertThat(jdbc.queryForObject("SELECT origine FROM audit_revision WHERE id = ?", String.class, revision)).isEqualTo("MIGRATION");

        assertThat(lignesAud("permission_aud", revision, (short) 0)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT code FROM permission_aud WHERE rev = ?", String.class, revision)).isEqualTo("CARTE_READ");
        assertThat(lignesAud("role_permission_aud", revision, (short) 0)).as("DIRECTION et SYSTEM_ADMIN").isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT nom FROM role_aud WHERE rev = ? AND revtype = 0", String.class, revision))
                .as("le rôle créé").containsExactly("DIRECTION");
        assertThat(jdbc.queryForList("SELECT nom FROM role_aud WHERE rev = ? AND revtype = 1", String.class, revision))
                .as("le rôle propriétaire de l'autre liaison est versionné aussi").containsExactly("SYSTEM_ADMIN");
        assertThat(((Number) permission.get("nombre_elements")).longValue()).isEqualTo(1 + 2);
        assertThat(((Number) role.get("nombre_elements")).longValue()).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT entite FROM audit_revision_entite WHERE revision_id = ? ORDER BY entite", String.class, revision))
                .containsExactly("staport.rh.auth.entities.Permission", "staport.rh.auth.entities.Role");
    }
}
