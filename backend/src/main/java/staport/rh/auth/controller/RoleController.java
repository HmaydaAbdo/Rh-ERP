package staport.rh.auth.controller;

import io.swagger.v3.oas.annotations.Operation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import staport.rh.auth.dtos.request.RoleSearchCriteria;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.services.interfaces.IRoleService;

import java.util.List;

/** Écriture des rôles réservée à ROLE_MANAGE ; leurs lectures et le catalogue servent aussi à l'administration des comptes. */
@RestController
@Tag(name = "Rôles", description = "Rôles administrables et catalogue des permissions")
@PreAuthorize("hasAuthority('ROLE_MANAGE')")
public class RoleController {

    private final IRoleService roleService;

    public RoleController(IRoleService roleService) {
        this.roleService = roleService;
    }

    @PostMapping("/roles/search")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGE', 'USER_MANAGE')")
    @Operation(summary = "Rechercher des rôles", description = "Pagination serveur ; tri sur nom ou description.")
    public ResponseEntity<Page<RoleResponseDto>> search(@Valid @RequestBody(required = false) RoleSearchCriteria criteria,
                                                         @PageableDefault(size = 20, sort = "nom") Pageable pageable) {
        return ResponseEntity.ok(roleService.search(criteria, pageable));
    }

    @GetMapping("/roles/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGE', 'USER_MANAGE')")
    @Operation(summary = "Lire un rôle")
    public ResponseEntity<RoleResponseDto> findById(@PathVariable Long id) {
        return ResponseEntity.ok(roleService.findById(id));
    }

    @PostMapping("/roles")
    @Operation(summary = "Créer un rôle")
    @ApiResponse(responseCode = "201", description = "Rôle créé.")
    public ResponseEntity<RoleResponseDto> create(@Valid @RequestBody RoleCreateRequestDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(roleService.create(dto));
    }

    @PutMapping("/roles/{id}")
    @Operation(summary = "Modifier un rôle", description = "Le rôle d'administration n'est ni renommable ni amputable de permissions.")
    public ResponseEntity<RoleResponseDto> update(@PathVariable Long id, @Valid @RequestBody RoleUpdateRequestDto dto) {
        return ResponseEntity.ok(roleService.update(id, dto));
    }

    @DeleteMapping("/roles/{id}")
    @Operation(summary = "Supprimer un rôle")
    @ApiResponse(responseCode = "409", description = "Rôle encore attribué à des comptes, ou rôle d'administration")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        roleService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/permissions")
    @PreAuthorize("hasAnyAuthority('ROLE_MANAGE', 'USER_MANAGE')")
    @Operation(summary = "Lister le catalogue des permissions")
    public ResponseEntity<List<PermissionResponseDto>> findAllPermissions() {
        return ResponseEntity.ok(roleService.findAllPermissions());
    }
}
