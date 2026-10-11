package staport.rh.auth.services;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.AuditIntegrationTestBase;
import org.springframework.data.domain.Pageable;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleSearchCriteria;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.exceptions.ProtectedRoleException;
import staport.rh.auth.services.interfaces.IRoleService;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Le rôle d'administration de départ ne peut être ni supprimé, ni renommé, ni privé de permissions : sa description seule
 * se modifie. Les autres rôles restent entièrement libres.
 */
class RoleAdministrationProtegeeTest extends AuditIntegrationTestBase {

    @Autowired
    private IRoleService roleService;

    private RoleResponseDto admin() {
        return roleService.search(new RoleSearchCriteria("SYSTEM_ADMIN", null), Pageable.unpaged()).getContent().stream().filter(r -> r.nom().equals("SYSTEM_ADMIN")).findFirst().orElseThrow();
    }

    private static Set<Long> ids(RoleResponseDto role) {
        return role.permissions().stream().map(PermissionResponseDto::id).collect(Collectors.toSet());
    }

    @Test
    void le_role_d_administration_est_signale_protege_et_pas_les_autres() {
        String s = Long.toHexString(System.nanoTime());
        RoleResponseDto libre = roleService.create(new RoleCreateRequestDto("Libre-" + s, null, Set.of()));

        assertThat(admin().protege()).isTrue();
        assertThat(libre.protege()).isFalse();
    }

    @Test
    void renommer_le_role_d_administration_est_refuse() {
        RoleResponseDto admin = admin();

        assertThatThrownBy(() -> roleService.update(admin.id(), new RoleUpdateRequestDto(admin.version(), "ADMIN_RENOMME", admin.description(), ids(admin))))
                .isInstanceOf(ProtectedRoleException.class).hasMessageContaining("renommé");

        assertThat(admin().nom()).isEqualTo("SYSTEM_ADMIN");
    }

    @Test
    void retirer_une_permission_au_role_d_administration_est_refuse() {
        RoleResponseDto admin = admin();
        Set<Long> amputees = new HashSet<>(ids(admin));
        amputees.remove(admin.permissions().iterator().next().id());

        assertThatThrownBy(() -> roleService.update(admin.id(), new RoleUpdateRequestDto(admin.version(), admin.nom(), admin.description(), amputees)))
                .isInstanceOf(ProtectedRoleException.class).hasMessageContaining("privé de permissions");
        assertThatThrownBy(() -> roleService.update(admin.id(), new RoleUpdateRequestDto(admin.version(), admin.nom(), admin.description(), Set.of())))
                .isInstanceOf(ProtectedRoleException.class);

        assertThat(ids(admin())).isEqualTo(ids(admin));
    }

    @Test
    void la_description_du_role_d_administration_reste_modifiable() {
        RoleResponseDto admin = admin();

        RoleResponseDto modifie = roleService.update(admin.id(), new RoleUpdateRequestDto(admin.version(), admin.nom(), "Description modifiée", ids(admin)));
        assertThat(modifie.description()).isEqualTo("Description modifiée");

        RoleResponseDto modifieEncore = roleService.update(admin.id(), new RoleUpdateRequestDto(modifie.version(), modifie.nom(), admin.description(), ids(admin)));
        assertThat(modifieEncore.description()).isEqualTo(admin.description());
    }

    @Test
    void un_autre_role_se_renomme_et_perd_ses_permissions_librement() {
        String s = Long.toHexString(System.nanoTime());
        RoleResponseDto libre = roleService.create(new RoleCreateRequestDto("Libre-" + s, null, ids(admin())));

        RoleResponseDto modifie = roleService.update(libre.id(), new RoleUpdateRequestDto(libre.version(), "Renomme-" + s, null, Set.of()));

        assertThat(modifie.nom()).isEqualTo("Renomme-" + s);
        assertThat(modifie.permissions()).isEmpty();
    }
}
