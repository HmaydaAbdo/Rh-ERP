package staport.rh.auth.security;

import org.junit.jupiter.api.Test;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.Utilisateur;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class EffectivePermissionResolverTest {

    private final EffectivePermissionResolver resolver = new EffectivePermissionResolver();

    @Test
    void resolve_devraitUnirLesPermissionsDeTousLesRoles() {
        Permission read = permission("EMPLOYEE_READ");
        Permission write = permission("EMPLOYEE_WRITE");
        Permission paieRead = permission("PAIE_READ");

        Role consultation = role("CONSULTATION", read, paieRead);
        Role redacteur = role("REDACTEUR", write);

        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setRoles(Set.of(consultation, redacteur));

        assertThat(resolver.resolve(utilisateur)).containsExactlyInAnyOrder(
                "EMPLOYEE_READ", "PAIE_READ", "EMPLOYEE_WRITE");
    }

    @Test
    void resolve_leDenyOverrideDoitBattreLaPermissionDuRole() {
        Permission read = permission("EMPLOYEE_READ");
        Permission write = permission("EMPLOYEE_WRITE");
        Role role = role("CONSULTATION", read, write);

        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setRoles(Set.of(role));
        utilisateur.setPermissionsRefusees(Set.of(read));

        assertThat(resolver.resolve(utilisateur)).containsExactly("EMPLOYEE_WRITE");
    }

    @Test
    void resolve_devraitRetournerVideSansRole() {
        Utilisateur utilisateur = new Utilisateur();

        assertThat(resolver.resolve(utilisateur)).isEmpty();
    }

    @Test
    void roleNames_devraitListerLesNomsDesRolesDeLUtilisateur() {
        Role admin = role("SYSTEM_ADMIN");
        Role paie = role("PAIE_MANAGER");

        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setRoles(Set.of(admin, paie));

        assertThat(resolver.roleNames(utilisateur)).containsExactlyInAnyOrder("SYSTEM_ADMIN", "PAIE_MANAGER");
    }

    private Permission permission(String code) {
        Permission permission = new Permission();
        permission.setCode(code);
        permission.setDescription(code);
        return permission;
    }

    private Role role(String nom, Permission... permissions) {
        Role role = new Role();
        role.setNom(nom);
        role.setPermissions(Set.of(permissions));
        return role;
    }
}
